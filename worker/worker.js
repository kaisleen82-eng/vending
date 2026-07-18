const LUA_BODY = `-- [[ Services & Vars ]]
local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer
local Mouse = LocalPlayer:GetMouse()
local Camera = workspace.CurrentCamera
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local VirtualInputManager = game:GetService("VirtualInputManager")
local CoreGui = game:GetService("CoreGui")
local SoundService = game:GetService("SoundService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local MainEvent = ReplicatedStorage:FindFirstChild('MainEvent') or nil
local newcclosure = newcclosure or function(f) return f end

-- [[ Cached Configs ]]
local conditionsConfig = Config['Conditions']
local silentConfig = Config['Silent Aimbot']
local cameraConfig = Config['Camera Aimbot']
local triggerConfig = Config['Trigger Bot']
local spreadConfig = Config['Spread Modifications']
local hitboxConfig = Config['Hitbox Expander']
local macroConfig = Config['Normal Macro']
local noclipMacroConfig = Config['Noclip Macro']

-- [[ Cached KeyCodes ]]
local cameraKey = Enum.KeyCode[cameraConfig['Configurations']['Bind']['Key']]
local triggerKey = Enum.KeyCode[triggerConfig['Keybind']['Key']]
local macroKey = Enum.KeyCode[macroConfig['Keybind']['Key']]
local noclipKey = Enum.KeyCode[noclipMacroConfig['Keybind']['Key']]
local spreadKey = Enum.KeyCode.J
local cleanupKey = Enum.KeyCode.End

-- [[ Head Settings ]]
local HeadSettings = {
    HeadPartName = 'Head',
    HeadOffsetScale = 0.8,
}

-- [[ Adornments ]]
local silentFovBox = Instance.new("BoxHandleAdornment")
silentFovBox.Color3 = Color3.fromRGB(255, 0, 0)
silentFovBox.Transparency = 0.5
silentFovBox.AlwaysOnTop = false
silentFovBox.ZIndex = 1
silentFovBox.Adornee = nil
silentFovBox.Visible = false
silentFovBox.Parent = CoreGui
local silentFovSize = Vector3.new(silentConfig['FOV']['X'], silentConfig['FOV']['Y'], silentConfig['FOV']['Z'])

local cameraFovBox = Instance.new("BoxHandleAdornment")
cameraFovBox.Color3 = Color3.fromRGB(0, 255, 0)
cameraFovBox.Transparency = 0.5
cameraFovBox.AlwaysOnTop = false
cameraFovBox.ZIndex = 1
cameraFovBox.Adornee = nil
cameraFovBox.Visible = false
cameraFovBox.Parent = CoreGui
local cameraFovSize = Vector3.new(cameraConfig['FOV']['X'], cameraConfig['FOV']['Y'], cameraConfig['FOV']['Z'])

-- [[ States ]]
local lastUpdate = 0
local updateInterval = 0.2
local lastAutoGetUp = 0
local autoGetUpInterval = 0.1
local lastSpreadToggle = 0
local toggleDebounce = 0.1
local originalSizes = {}
local macroActive = false
local macro_in_use = false
local last_macro_instruction = 0
local noClipActive = false
local lastNoClipToggle = 0
local spreadModActive = true
local lastGunName = nil
local lastEquippedGun = nil
local visibilityCache = {} -- { [character] = { time, result } }
local Plr = nil
local Locking = false
local lockCooldown = 0
local aimAssistToggleState = false

-- [[ Fast Elastic Easing ]]
local function FastElasticEase(t)
    if t <= 0 then return 0 end
    if t >= 1 then return 1 end
    t = t / 2
    local p = 0.3
    local s = p / 4
    return 1 + 2^(-10 * t) * math.sin((t - s) * (2 * math.pi) / p)
end

-- [[ Point Generation Cache ]]
local offsetsCache = setmetatable({}, { __mode = "k" })
local function generateOffsetsForPart(part, div)
    if div <= 1 then return { Vector3.new(0, 0, 0) } end
    local cache = offsetsCache[part]
    if cache and cache.size == part.Size and cache.div == div then
        return cache.offsets
    end
    local offsets = {}
    for ix = 0, div - 1 do
        local nx = (ix / (div - 1)) - 0.5
        for iy = 0, div - 1 do
            local ny = (iy / (div - 1)) - 0.5
            for iz = 0, div - 1 do
                local nz = (iz / (div - 1)) - 0.5
                local localOffset = Vector3.new(nx * part.Size.X, ny * part.Size.Y, nz * part.Size.Z)
                if part.Name == HeadSettings.HeadPartName then
                    localOffset = localOffset * HeadSettings.HeadOffsetScale
                end
                table.insert(offsets, localOffset)
            end
        end
    end
    offsetsCache[part] = { size = part.Size, div = div, offsets = offsets }
    return offsets
end

-- [[ Player Validation ]]
local function IsValidTarget(character)
    if not character or not character.Parent then return false end
    if conditionsConfig.Knocked then
        local bodyEffects = character:FindFirstChild('BodyEffects')
        if bodyEffects and (bodyEffects:FindFirstChild('K.O') or bodyEffects:FindFirstChild('KO')) and bodyEffects[bodyEffects:FindFirstChild('K.O') and 'K.O' or 'KO'].Value then
            return false
        end
    end
    if conditionsConfig.Reloading then
        local localCharacter = LocalPlayer.Character
        if localCharacter and localCharacter:FindFirstChild('BodyEffects') and localCharacter.BodyEffects:FindFirstChild('Reload') and localCharacter.BodyEffects.Reload.Value then
            return false
        end
    end
    if conditionsConfig.Visible then
        local cache = visibilityCache[character]
        local currentTime = tick()
        if cache and currentTime - cache.time < 0.5 then
            return cache.result
        end
        local hrp = character:FindFirstChild("HumanoidRootPart") or character.PrimaryPart
        if hrp then
            local rayOrigin = Camera.CFrame.Position
            local rayDirection = (hrp.Position - rayOrigin).Unit * 100
            local raycastParams = RaycastParams.new()
            raycastParams.FilterType = Enum.RaycastFilterType.Blacklist
            raycastParams.FilterDescendantsInstances = {LocalPlayer.Character}
            local raycastResult = workspace:Raycast(rayOrigin, rayDirection, raycastParams)
            local result = not (raycastResult and raycastResult.Instance and raycastResult.Instance:FindFirstAncestorOfClass("Model") ~= character)
            visibilityCache[character] = { time = currentTime, result = result }
            return result
        end
        return false
    end
    if conditionsConfig.Protected then
        if character:FindFirstChildOfClass("ForceField") then return false end
        local humanoid = character:FindFirstChildOfClass("Humanoid")
        if humanoid and humanoid:GetAttribute("LastRespawnTime") and (tick() - humanoid:GetAttribute("LastRespawnTime")) < 6 then
            return false
        end
    end
    return true
end

-- [[ Cached Player List ]]
local validPlayers = {}
local function UpdateValidPlayers()
    validPlayers = {}
    for _, plr in ipairs(Players:GetPlayers()) do
        if plr ~= LocalPlayer and plr.Character and plr.Character.Parent and plr.Character:FindFirstChildOfClass("Humanoid") and plr.Character:FindFirstChildOfClass("Humanoid").Health > 0 and IsValidTarget(plr.Character) then
            table.insert(validPlayers, plr)
        end
    end
end
UpdateValidPlayers()

-- [[ Get Closest Player ]]
local function GetClosestPlayer()
    local mousePos = UserInputService:GetMouseLocation()
    local bestChar, bestDist = nil, math.huge
    for _, plr in ipairs(validPlayers) do
        local char = plr.Character
        local hrp = char:FindFirstChild("HumanoidRootPart") or char.PrimaryPart
        if hrp then
            local vp = Camera:WorldToViewportPoint(hrp.Position)
            if vp.Z > 0 then
                local dist = math.abs(vp.X - mousePos.X) + math.abs(vp.Y - mousePos.Y)
                if dist < bestDist then
                    bestDist = dist
                    bestChar = char
                end
            end
        end
    end
    return bestChar
end

-- [[ Check FOV Box ]]
local function IsMouseInFOVBox(character, fovConfig)
    if not character or not character:FindFirstChild("HumanoidRootPart") then return false end
    local hrp = character:FindFirstChild("HumanoidRootPart")
    local fovSize = Vector3.new(fovConfig['X'], fovConfig['Y'], fovConfig['Z'])
    local mousePos = UserInputService:GetMouseLocation()
    local corners = {
        Vector3.new(-fovSize.X / 2, -fovSize.Y / 2, -fovSize.Z / 2),
        Vector3.new(fovSize.X / 2, fovSize.Y / 2, fovSize.Z / 2)
    }
    local minX, maxX, minY, maxY = math.huge, -math.huge, math.huge, -math.huge
    for _, corner in ipairs(corners) do
        local worldPos = hrp.CFrame * corner
        local screenPos, onScreen = Camera:WorldToViewportPoint(worldPos)
        if onScreen then
            minX = math.min(minX, screenPos.X)
            maxX = math.max(maxX, screenPos.X)
            minY = math.min(minY, screenPos.Y)
            maxY = math.max(maxY, screenPos.Y)
        end
    end
    return mousePos.X >= minX and mousePos.X <= maxX and mousePos.Y >= minY and mousePos.Y <= maxY
end

-- [[ Get Closest Point ]]
local function GetClosestPointFromPoints(character)
    if not character then return nil, nil end
    local mousePos = UserInputService:GetMouseLocation()
    local bestPoint, bestPart, bestDist = nil, nil, math.huge
    local div = silentConfig['Closest Point']['SubDivisions']
    for _, part in ipairs(character:GetChildren()) do
        if part:IsA("BasePart") then
            local offsets = generateOffsetsForPart(part, div)
            for i = 1, #offsets do
                local worldPos = part.CFrame * offsets[i]
                local vp = Camera:WorldToViewportPoint(worldPos)
                if vp.Z > 0 then
                    local dist = math.abs(vp.X - mousePos.X) + math.abs(vp.Y - mousePos.Y)
                    if dist < bestDist then
                        bestDist = dist
                        bestPoint = worldPos
                        bestPart = part
                    end
                end
            end
        end
    end
    return bestPoint, bestPart
end

-- [[ Get Closest Part for Camera Aimbot ]]
local ValidBodyParts = {
    'Head',
    'HumanoidRootPart',
    'Torso',
    'UpperTorso',
    'LowerTorso',
    'LeftArm',
    'LeftUpperArm',
    'LeftLowerArm',
    'RightArm',
    'RightUpperArm',
    'RightLowerArm',
    'LeftLeg',
    'LeftUpperLeg',
    'LeftLowerLeg',
    'RightLeg',
    'RightUpperLeg',
    'RightLowerLeg',
}
local function getClosestPartToCursor(player)
    if not player or not player.Character then return nil end
    local character = player.Character
    local mousePos = UserInputService:GetMouseLocation()
    local closestPart, closestDistance = nil, math.huge
    for _, partName in ipairs(ValidBodyParts) do
        local part = character:FindFirstChild(partName)
        if part then
            local screenPos, visible = Camera:WorldToViewportPoint(part.Position)
            if visible then
                local distance = (Vector2.new(screenPos.X, screenPos.Y) - mousePos).Magnitude
                if distance < closestDistance then
                    closestDistance = distance
                    closestPart = part
                end
            end
        end
    end
    return closestPart
end

-- [[ Play Sound ]]
local function PlaySound(soundId, volume)
    local sound = Instance.new('Sound')
    sound.SoundId = soundId
    sound.Volume = volume or 0.5
    sound.Parent = SoundService
    sound.Ended:Connect(function() sound:Destroy() end)
    sound:Play()
end

-- [[ Auto Get Up ]]
local function handleAutoGetUp(currentTime)
    if currentTime - lastAutoGetUp < autoGetUpInterval then return end
    lastAutoGetUp = currentTime
    local character = LocalPlayer.Character
    if not character then return end
    local humanoid = character:FindFirstChildOfClass('Humanoid')
    if not humanoid or humanoid:GetState() ~= Enum.HumanoidStateType.FallingDown then return end
    humanoid:ChangeState(Enum.HumanoidStateType.GettingUp)
end

-- [[ Spread Modifications ]]
local function GetSpreadGunName()
    local character = LocalPlayer.Character
    if not character then return nil end
    local tool = character:FindFirstChildOfClass('Tool')
    if not tool then return nil end
    local toolName = tool.Name:gsub('%[', ''):gsub('%]', '')
    if toolName:lower():find('double') or toolName:lower():find('db') then
        return 'DoubleBarrelSG'
    elseif toolName:lower():find('tactical') then
        return 'TacticalShotgun'
    elseif toolName:lower():find('shotgun') then
        return 'DrumShotgun'
    end
    return nil
end

local function GetSpreadModifier()
    if not spreadModActive or not spreadConfig['Enabled'] then return 1 end
    if not lastGunName or not spreadConfig[lastGunName] then return 1 end
    local method = spreadConfig['Method']
    if method == 'basic' then
        return tonumber(spreadConfig[lastGunName]['Spread'])
    elseif method == 'randomized' then
        local minSpread = tonumber(spreadConfig[lastGunName]['Random']['Min'])
        local maxSpread = tonumber(spreadConfig[lastGunName]['Random']['Max'])
        return math.random(math.floor(minSpread * 1000), math.floor(maxSpread * 1000)) / 1000
    end
    return 1
end

local oldRandom
oldRandom = hookfunction(math.random, function(...)
    if checkcaller() then return oldRandom(...) end
    local args = {...}
    if #args == 0 or args[1] == -0.1 or args[1] == -0.05 or (args[1] == -0.05 and args[2] == 0.05) then
        if spreadModActive then
            return oldRandom(...) * GetSpreadModifier()
        end
    end
    return oldRandom(...)
end)

-- [[ Hitbox Expander ]]
local function GetEquippedGunName()
    local character = LocalPlayer.Character
    if not character then return nil end
    local tool = character:FindFirstChildOfClass('Tool')
    if not tool then return nil end
    local toolName = tool.Name
    if hitboxConfig['Config'][toolName] then return toolName end
    return nil
end

local function restoreHitboxSizes()
    for _, player in pairs(Players:GetPlayers()) do
        if player ~= LocalPlayer and player.Character then
            for _, bodyPart in pairs(player.Character:GetChildren()) do
                if bodyPart:IsA('Part') and originalSizes[bodyPart] then
                    bodyPart.Size = originalSizes[bodyPart]
                end
            end
        end
    end
end

local function handleHitboxExpander()
    if not hitboxConfig['Enabled'] then
        restoreHitboxSizes()
        return
    end
    local equippedGun = GetEquippedGunName()
    if equippedGun ~= lastEquippedGun then
        lastEquippedGun = equippedGun
        if not equippedGun or not hitboxConfig['Config'][equippedGun] then
            restoreHitboxSizes()
            return
        end
        local config = hitboxConfig['Config'][equippedGun]
        local heightMultiplier = config.H
        local widthMultiplier = config.W
        for _, player in pairs(Players:GetPlayers()) do
            if player ~= LocalPlayer and player.Character then
                for _, bodyPart in pairs(player.Character:GetChildren()) do
                    if bodyPart:IsA('Part') then
                        if not originalSizes[bodyPart] then
                            originalSizes[bodyPart] = bodyPart.Size
                        end
                        local originalSize = originalSizes[bodyPart]
                        bodyPart.Size = Vector3.new(originalSize.X * widthMultiplier, originalSize.Y * heightMultiplier, originalSize.Z)
                    end
                end
            end
        end
    end
end

-- [[ Trigger Bot ]]
local function mouse1press(x, y)
    local mousePos = UserInputService:GetMouseLocation()
    if VirtualInputManager then
        VirtualInputManager:SendMouseButtonEvent(mousePos.X, mousePos.Y, 0, true, game, 1)
    end
end

local function mouse1release(x, y)
    local mousePos = UserInputService:GetMouseLocation()
    if VirtualInputManager then
        VirtualInputManager:SendMouseButtonEvent(mousePos.X, mousePos.Y, 0, false, game, 1)
    end
end

local function simulateClick(mousePos, triggerBotConfig)
    local start_delay = tonumber(triggerBotConfig['Start'])
    local end_delay = tonumber(triggerBotConfig['End'])
    if triggerBotConfig['Config']['Mode'] == 'Randomized' then
        start_delay = math.random() * (start_delay - end_delay) + end_delay
        end_delay = math.random() * (start_delay - end_delay) + end_delay
    end
    mouse1press(mousePos.X, mousePos.Y)
    task.wait(start_delay)
    mouse1release(mousePos.X, mousePos.Y)
    task.wait(end_delay)
end

local function isCursorOverPlayer()
    local target = Mouse.Target
    if target then
        local character = target.Parent
        local humanoid = character:FindFirstChildOfClass('Humanoid')
        if humanoid and character ~= LocalPlayer.Character then
            local player = Players:GetPlayerFromCharacter(character)
            if player and triggerConfig['Config']['Part'] == 'ClosestPart' then
                return IsValidTarget(character)
            end
        end
    end
    return false
end

-- [[ Trigger Bot Input ]]
UserInputService.InputBegan:Connect(function(input, gameProcessed)
    if gameProcessed then return end
    local triggerKey = Enum.KeyCode[triggerConfig['Keybind']['Key']]
    if input.KeyCode == triggerKey and triggerConfig['Enabled'] and triggerConfig['Keybind']['Mode'] == 'Hold' then
        spawn(function()
            while UserInputService:IsKeyDown(triggerKey) do
                if isCursorOverPlayer() then
                    local mousePos = UserInputService:GetMouseLocation()
                    simulateClick(mousePos, triggerConfig)
                end
                task.wait(0.02)
            end
        end)
    end
end)

-- [[ Normal Macro ]]
local function builtin_macro_function()
    if not macroActive or not macroConfig['Enabled'] then return end
    if macro_in_use or os.clock() - last_macro_instruction < tonumber(macroConfig['Delay']) then return end
    macro_in_use = true
    if VirtualInputManager then
        local delay = tonumber(macroConfig['Delay']) / 2
        VirtualInputManager:SendMouseWheelEvent(0, 0, true, game)
        task.wait(delay)
        VirtualInputManager:SendMouseWheelEvent(0, 0, false, game)
        task.wait(delay)
    else
        LocalPlayer.CameraMaxZoomDistance = 30
        task.wait()
        LocalPlayer.CameraMinZoomDistance = 0.5
    end
    last_macro_instruction = os.clock()
    macro_in_use = false
end

-- [[ Noclip Macro ]]
local function getNoClipTool(slot)
    local robloxGui = CoreGui:FindFirstChild('RobloxGui')
    if not robloxGui then return nil end
    local backpack = robloxGui:FindFirstChild('Backpack')
    if not backpack then return nil end
    local hotbar = backpack:FindFirstChild('Hotbar')
    if not hotbar then return nil end
    for _, v in pairs(hotbar:GetChildren()) do
        if v.Name:find(tostring(slot)) then
            return v.ToolName.Text
        end
    end
    return nil
end

local function handleNoClip()
    if not noclipMacroConfig['Enabled'] then
        noClipActive = false
        return
    end
    local char = LocalPlayer.Character
    if not char then
        noClipActive = false
        return
    end
    local hum = char:FindFirstChildOfClass('Humanoid')
    if not hum then
        noClipActive = false
        return
    end
    local currentTime = os.clock()
    if currentTime - lastNoClipToggle < tonumber(noclipMacroConfig['Delay']) then
        return
    end
    if noClipActive then
        local toolName = getNoClipTool(noclipMacroConfig['Slot'])
        if toolName and LocalPlayer.Backpack:FindFirstChild(toolName) then
            hum:EquipTool(LocalPlayer.Backpack:FindFirstChild(toolName))
        else
            hum:UnequipTools()
        end
        lastNoClipToggle = currentTime
    elseif hum:GetState() == Enum.HumanoidStateType.RunningNoPhysics then
        hum:UnequipTools()
    end
end

-- [[ Camera Aimbot Logic ]]
local function IsSelfKnocked()
    if not cameraConfig['Configurations']['Safety'] then
        return false
    end
    local character = LocalPlayer.Character
    if not character then
        return true
    end
    local effects = character:FindFirstChild('BodyEffects')
    if not effects then
        return true
    end
    local ko = effects:FindFirstChild('K.O') or effects:FindFirstChild('KO')
    return ko and ko.Value or false
end

local function IsReloading()
    if not cameraConfig['Configurations']['Safety'] then
        return true
    end
    local character = LocalPlayer.Character
    if not character then
        return true
    end
    local bodyEffects = character:FindFirstChild('BodyEffects')
    if not bodyEffects then
        return true
    end
    local reload = bodyEffects:FindFirstChild('Reload')
    return reload and not reload.Value or true
end

local function DisableOnThirdPerson()
    if not cameraConfig['Configurations']['Safety'] then
        return true
    end
    return (Camera.CFrame.Position - Camera.Focus.Position).Magnitude < 0.7
        and UserInputService.MouseBehavior == Enum.MouseBehavior.LockCenter
end

local function CheckHoldingGun()
    if not cameraConfig['Configurations']['Safety'] then
        return true
    end
    local character = LocalPlayer.Character
    if not character then
        return false
    end
    local humanoid = character:FindFirstChildOfClass('Humanoid')
    if not humanoid then
        return false
    end
    local tool = character:FindFirstChildOfClass('Tool')
    return tool and tool.Name ~= '[Knife]' or false
end

local function IsBehindWall(target)
    if not target or not cameraConfig['Configurations']['Safety'] then
        return false
    end
    local origin = Camera.CFrame.Position
    local targetPos = target.Position
    local direction = (targetPos - origin).Unit * 1000
    local params = RaycastParams.new()
    params.FilterDescendantsInstances = { LocalPlayer.Character or {} }
    params.FilterType = Enum.RaycastFilterType.Blacklist
    local ray = workspace:Raycast(origin, direction, params)
    return ray and ray.Instance and not ray.Instance:IsDescendantOf(target.Parent)
end

local function getClosestPlayerToCursor(allowNewTarget)
    local maxDistance = 240
    local minDistance = 0
    local fovSize = cameraConfig['FOV']['X']

    if IsSelfKnocked() then
        Plr = nil
        Locking = false
        return nil
    end

    if Plr and Plr.Character and Plr.Character:FindFirstChild('HumanoidRootPart') and Plr.Character:FindFirstChild('Humanoid') then
        local root = Plr.Character.HumanoidRootPart
        local distance = (root.Position - Camera.CFrame.Position).Magnitude
        local screenPos, cameraVisible = Camera:WorldToViewportPoint(root.Position)
        local mousePos = Vector2.new(UserInputService:GetMouseLocation().X, UserInputService:GetMouseLocation().Y)
        local distToMouse = (mousePos - Vector2.new(screenPos.X, screenPos.Y)).Magnitude

        if distance > maxDistance or distance < minDistance or distToMouse > fovSize or not IsValidTarget(Plr.Character) or IsBehindWall(root) or (cameraConfig['Configurations']['Safety'] and not IsReloading()) or (cameraConfig['Configurations']['Safety'] and not DisableOnThirdPerson()) or (cameraConfig['Configurations']['Safety'] and not CheckHoldingGun()) then
            Plr = nil
            Locking = false
            lockCooldown = os.clock() + 0.2
            return nil
        end

        if cameraVisible then
            return Plr
        end
    end

    if not allowNewTarget or os.clock() < lockCooldown then
        return nil
    end

    local closestDist = math.huge
    local closestPlr = nil
    for _, v in ipairs(Players:GetPlayers()) do
        if v ~= LocalPlayer and v.Character and v.Character:FindFirstChild('Humanoid') and v.Character.Humanoid.Health > 0 then
            if not IsValidTarget(v.Character) then
                continue
            end
            local root = v.Character:FindFirstChild('HumanoidRootPart')
            if not root then
                continue
            end
            if IsBehindWall(root) then
                continue
            end
            if cameraConfig['Configurations']['Safety'] and not IsReloading() then
                continue
            end
            if cameraConfig['Configurations']['Safety'] and not DisableOnThirdPerson() then
                continue
            end
            if cameraConfig['Configurations']['Safety'] and not CheckHoldingGun() then
                continue
            end

            local distance = (root.Position - Camera.CFrame.Position).Magnitude
            if distance > maxDistance or distance < minDistance then
                continue
            end

            local screenPos, cameraVisible = Camera:WorldToViewportPoint(root.Position)
            if cameraVisible then
                local mousePos = Vector2.new(UserInputService:GetMouseLocation().X, UserInputService:GetMouseLocation().Y)
                local distToMouse = (mousePos - Vector2.new(screenPos.X, screenPos.Y)).Magnitude
                if distToMouse <= fovSize and distToMouse < closestDist then
                    closestPlr = v
                    closestDist = distToMouse
                end
            end
        end
    end
    return closestPlr
end

local function SmoothAim(targetPos)
    if not targetPos then
        return
    end
    local currentCFrame = Camera.CFrame
    local targetCFrame = CFrame.new(currentCFrame.Position, targetPos)

    local distance = Plr and Plr.Character and Plr.Character:FindFirstChild('HumanoidRootPart') and (Plr.Character.HumanoidRootPart.Position - Camera.CFrame.Position).Magnitude or 200
    local smoothFactor = math.clamp(cameraConfig['Configurations']['Snappiness'], 0.01, 1)

    local elasticFactor = math.clamp(smoothFactor * 0.5, 0.01, 0.5)
    local sineFactor = math.clamp(smoothFactor, 0.01, 1)
    local smoothCFrame = currentCFrame:Lerp(targetCFrame, elasticFactor, Enum.EasingStyle.Elastic, Enum.EasingDirection.Out)
    smoothCFrame = smoothCFrame:Lerp(targetCFrame, sineFactor, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut)

    Camera.CFrame = smoothCFrame
    if MainEvent then
        MainEvent:FireServer('UpdateMousePosI', targetPos)
    end
end

local lastMousePos = Vector2.new(Mouse.X, Mouse.Y)
local function UpdateMousePos()
    local currentMousePos = Vector2.new(Mouse.X, Mouse.Y)
    if currentMousePos ~= lastMousePos then
        lastMousePos = currentMousePos
        return true
    end
    return false
end

-- [[ Other Input Handling ]]
UserInputService.InputBegan:Connect(function(input, gameProcessed)
    if gameProcessed then return end
    local currentTime = tick()
    if input.KeyCode == cameraKey and cameraConfig['Enabled'] and cameraConfig['Configurations']['Bind']['Mode'] == 'Hold' then
        -- Handled in RenderStepped
    elseif input.KeyCode == cameraKey and cameraConfig['Enabled'] and cameraConfig['Configurations']['Bind']['Mode'] == 'Toggle' then
        aimAssistToggleState = not aimAssistToggleState
    elseif input.KeyCode == macroKey and macroConfig['Enabled'] and macroConfig['Keybind']['Mode'] == 'Hold' then
        macroActive = true
    elseif input.KeyCode == noclipKey and noclipMacroConfig['Enabled'] and noclipMacroConfig['Keybind']['Mode'] == 'Hold' then
        noClipActive = true
    elseif input.KeyCode == spreadKey and spreadConfig['Enabled'] and currentTime - lastSpreadToggle >= toggleDebounce then
        lastSpreadToggle = currentTime
        spreadModActive = not spreadModActive
        PlaySound(spreadModActive and 'rbxassetid://1788243907' or 'rbxassetid://9125609918', spreadModActive and 1 or 2)
    elseif input.KeyCode == cleanupKey then
        Cleanup()
    end
end)

UserInputService.InputEnded:Connect(function(input)
    if input.KeyCode == macroKey and macroConfig['Enabled'] and macroConfig['Keybind']['Mode'] == 'Hold' then
        macroActive = false
    elseif input.KeyCode == noclipKey and noclipMacroConfig['Enabled'] and noclipMacroConfig['Keybind']['Mode'] == 'Hold' then
        noClipActive = false
        local hum = LocalPlayer.Character and LocalPlayer.Character:FindFirstChildOfClass('Humanoid')
        if hum and hum:GetState() == Enum.HumanoidStateType.RunningNoPhysics then
            hum:UnequipTools()
        end
    end
end)

-- [[ Silent Aimbot Hook ]]
local mt = getrawmetatable(game) -- Get the metatable of the game
local oldIndex = mt.__index
setreadonly(mt, false)
mt.__index = newcclosure(function(self, idx)
    if not checkcaller() and self == Mouse and silentConfig['Enabled'] then
        local char = GetClosestPlayer()
        if char and IsMouseInFOVBox(char, silentConfig['FOV']) then
            local point, part = GetClosestPointFromPoints(char)
            if point and part then
                if idx == "Hit" then return CFrame.new(point) end
                if idx == "Target" then return part end
            end
        end
    end
    return oldIndex(self, idx)
end)
setreadonly(mt, true)

-- [[ Update Loop ]]
RunService.RenderStepped:Connect(function(deltaTime)
    local currentTime = tick()

    -- Update player list and hitboxes periodically
    if currentTime - lastUpdate >= updateInterval then
        UpdateValidPlayers()
        handleHitboxExpander()
        lastUpdate = currentTime
        lastGunName = GetSpreadGunName() -- Update cached gun name
    end

    -- Silent Aimbot FOV Box
    if silentConfig['Enabled'] then
        local silentChar = GetClosestPlayer()
        if silentChar and silentChar:FindFirstChild("HumanoidRootPart") then
            local hrp = silentChar:FindFirstChild("HumanoidRootPart")
            silentFovBox.Adornee = hrp
            if silentFovBox.Size ~= silentFovSize then
                silentFovBox.Size = silentFovSize
            end
        else
            silentFovBox.Adornee = nil
        end
    else
        silentFovBox.Adornee = nil
    end

    -- Camera Aimbot FOV Box
    if cameraConfig['Enabled'] then
        local cameraChar = GetClosestPlayer()
        if cameraChar and cameraChar:FindFirstChild("HumanoidRootPart") then
            local hrp = cameraChar:FindFirstChild("HumanoidRootPart")
            cameraFovBox.Adornee = hrp
            if cameraFovBox.Size ~= cameraFovSize then
                cameraFovBox.Size = cameraFovSize
            end
        else
            cameraFovBox.Adornee = nil
        end
    else
        cameraFovBox.Adornee = nil
    end

    -- Camera Aimbot Logic
    if cameraConfig['Enabled'] then
        local mode = cameraConfig['Configurations']['Bind']['Mode']
        local keyPressed = UserInputService:IsKeyDown(cameraKey)
        if mode == 'Hold' then
            if keyPressed then
                if not Locking and os.clock() >= lockCooldown then
                    Plr = getClosestPlayerToCursor(true)
                    Locking = Plr ~= nil
                end
            else
                Plr = nil
                Locking = false
                lockCooldown = os.clock() + 0.2
            end
        elseif mode == 'Toggle' then
            if not aimAssistToggleState then
                Plr = nil
                Locking = false
            elseif not Locking and os.clock() >= lockCooldown then
                Plr = getClosestPlayerToCursor(true)
                Locking = Plr ~= nil
            end
        end

        if Locking and Plr and Plr.Character and Plr.Character:FindFirstChild('Humanoid') then
            local root = Plr.Character:FindFirstChild('HumanoidRootPart')
            if not root then
                Plr = nil
                Locking = false
                aimAssistToggleState = false
                lockCooldown = os.clock() + 0.2
                return
            end

            local distance = (root.Position - Camera.CFrame.Position).Magnitude
            local screenPos, cameraVisible = Camera:WorldToViewportPoint(root.Position)
            local mousePos = Vector2.new(UserInputService:GetMouseLocation().X, UserInputService:GetMouseLocation().Y)
            local distToMouse = (mousePos - Vector2.new(screenPos.X, screenPos.Y)).Magnitude
            local fovSize = cameraConfig['FOV']['X']

            if distance > 210 or distance < 1 or distToMouse > fovSize or not IsValidTarget(Plr.Character) or IsBehindWall(root) or (cameraConfig['Configurations']['Safety'] and not IsReloading()) or (cameraConfig['Configurations']['Safety'] and not DisableOnThirdPerson()) or (cameraConfig['Configurations']['Safety'] and not CheckHoldingGun()) then
                Plr = nil
                Locking = false
                aimAssistToggleState = false
                lockCooldown = os.clock() + 0.2
                return
            end

            local targetPos = nil
            if cameraConfig['Part'] == 'ClosestPart' then
                if UpdateMousePos() or not targetPos then
                    local part = getClosestPartToCursor(Plr)
                    if part then
                        targetPos = part.Position
                    end
                end
            end

            if targetPos then
                SmoothAim(targetPos)
            else
                Plr = nil
                Locking = false
                aimAssistToggleState = false
                lockCooldown = os.clock() + 0.2
            end
        end
    end

    -- Macro and Noclip
    if macroConfig['Enabled'] then builtin_macro_function() end
    if noclipMacroConfig['Enabled'] then handleNoClip() end
    handleAutoGetUp(currentTime)
end)

-- List of sound IDs to disable
local targetSoundIds = {
    'rbxassetid://1583819337',
    'rbxassetid://287062939',
    'rbxassetid://3855292863',
    'rbxassetid://3012391142',
}

local player = game.Players.LocalPlayer
local runService = game:GetService('RunService')

-- Function to disable target sounds
local function disableSound(sound)
    if sound:IsA('Sound') and table.find(targetSoundIds, sound.SoundId) then
        sound.Volume = 0
        sound:Stop()
    end
end

-- Disable existing sounds
for _, obj in pairs(workspace:GetDescendants()) do
    disableSound(obj)
end

-- Disable new sounds
workspace.DescendantAdded:Connect(disableSound)

-- Function to hide head and continuously remove face
local function hideHead(character)
    local head = character:WaitForChild('Head')

    -- Make head transparent
    if head:IsA('MeshPart') or head:IsA('Part') then
        head.Transparency = 1
    end

    -- Continuously destroy any decals or textures on head
    task.spawn(function()
        while head.Parent do
            for _, child in pairs(head:GetChildren()) do
                if child:IsA('Decal') or child:IsA('Texture') then
                    child:Destroy()
                end
            end
            task.wait(0.1) -- Check every 0.1s to remove any respawned face
        end
    end)
end

-- Handle respawns
player.CharacterAdded:Connect(hideHead)
if player.Character then
    hideHead(player.Character)
end

-- [[ Dependencies ]] --
local success, DeepFakePosition = pcall(function()
    return loadstring(game:HttpGet("https://raw.githubusercontent.com/Nosssa/NossLock/main/GetRealMousePosition"))()
end)
if not success or not DeepFakePosition then
    warn("loaded :)")
end

-- [[ Services & Vars ]] --
local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local LocalPlayer = Players.LocalPlayer
local Mouse = LocalPlayer:GetMouse()
local MainEvent = ReplicatedStorage:FindFirstChild("MainEvent") or nil

-- [[ Anti-Aimview Config ]] --
local AntiAimview = {
    Enabled = true,
    ToggleKey = Enum.KeyCode.G,
    GameArgs = {
        [2788229376] = "UpdateMousePosI2", -- Da Hood
        [71123788828242] = "D3RHooDMSOUEPoS233^+", -- Der Hood
        [5602055394] = "MousePosDHM"
    },
    DefaultArg = "UpdateMousePosI2"
}

-- [[ Utility Functions ]] --
local function RandomOffset(value)
    return type(value) == "number" and math.random(-value, value) or 0
end

-- [[ Toggle Anti-Aimview ]] --
UserInputService.InputBegan:Connect(function(input, gameProcessed)
    if not gameProcessed and input.KeyCode == AntiAimview.ToggleKey then
        AntiAimview.Enabled = not AntiAimview.Enabled
        print("Anti-Aimview " .. (AntiAimview.Enabled and "Enabled" or "Disabled"))
    end
end)

-- [[ Anti-Aimview Hook ]] --
local grm = getrawmetatable(game)
local namecall = grm.__namecall
setreadonly(grm, false)

grm.__namecall = function(self, ...)
    local args = {...}
    local method = getnamecallmethod()
    local targetArg = AntiAimview.GameArgs[game.PlaceId] or AntiAimview.DefaultArg

    if not checkcaller() and AntiAimview.Enabled and method == "FireServer" and self == MainEvent and args[1] == targetArg then
        if _G.FetchPosition then
            args[2] = _G.FetchPosition() + Vector3.new(RandomOffset(1), RandomOffset(1), RandomOffset(1))
            return namecall(self, unpack(args))
        end
    end
    return namecall(self, ...)
end

-- [[ Client-Side Cleanup ]] --
local function Cleanup()
    setreadonly(grm, true)
    grm.__namecall = namecall
    print("Anti-Aimview script cleaned up.")
end

-- [[ Manual Shutdown Trigger ]] --
UserInputService.InputBegan:Connect(function(input, gameProcessed)
    if not gameProcessed and input.KeyCode == Enum.KeyCode.End then -- Press 'End' to manually clean up
        Cleanup()
    end
end)


local InventoryChanger = { Functions = {}, Selected = {}, Skins = {}, Owned = {} };


local function createVendingCheatIntro()
    local player = game.Players.LocalPlayer
    local playerGui = player:WaitForChild("PlayerGui")
    local TweenService = game:GetService("TweenService")

    local screenGui = Instance.new("ScreenGui")
    screenGui.Name = "VendingIntro"
    screenGui.ResetOnSpawn = false
    screenGui.DisplayOrder = 999
    screenGui.Parent = playerGui

    local overlay = Instance.new("Frame")
    overlay.Size = UDim2.new(1, 0, 1, 0)
    overlay.BackgroundColor3 = Color3.fromRGB(0, 0, 0)
    overlay.BackgroundTransparency = 0.3
    overlay.BorderSizePixel = 0
    overlay.Parent = screenGui

    local mainFrame = Instance.new("Frame")
    mainFrame.Size = UDim2.new(0, 460, 0, 200)
    mainFrame.Position = UDim2.new(0.5, 0, 0.5, 0)
    mainFrame.AnchorPoint = Vector2.new(0.5, 0.5)
    mainFrame.BackgroundColor3 = Color3.fromRGB(12, 12, 20)
    mainFrame.BorderSizePixel = 0
    mainFrame.Parent = screenGui

    local corner = Instance.new("UICorner")
    corner.CornerRadius = UDim.new(0, 16)
    corner.Parent = mainFrame

    local stroke = Instance.new("UIStroke")
    stroke.Color = Color3.fromRGB(233, 75, 158)
    stroke.Thickness = 1.5
    stroke.Transparency = 0.4
    stroke.Parent = mainFrame

    local glow = Instance.new("Frame")
    glow.Size = UDim2.new(1, 40, 0, 2)
    glow.Position = UDim2.new(0, -20, 0.62, 0)
    glow.AnchorPoint = Vector2.new(0, 0.5)
    glow.BackgroundColor3 = Color3.fromRGB(233, 75, 158)
    glow.BackgroundTransparency = 0.3
    glow.BorderSizePixel = 0
    glow.Parent = mainFrame
    local glowCorner = Instance.new("UICorner")
    glowCorner.CornerRadius = UDim.new(1, 0)
    glowCorner.Parent = glow

    local logo = Instance.new("TextLabel")
    logo.Size = UDim2.new(1, -40, 0, 72)
    logo.Position = UDim2.new(0, 20, 0, 24)
    logo.BackgroundTransparency = 1
    logo.Text = "VENDING"
    logo.TextColor3 = Color3.fromRGB(255, 255, 255)
    logo.TextScaled = true
    logo.Font = Enum.Font.GothamBlack
    logo.TextXAlignment = Enum.TextXAlignment.Center
    logo.TextStrokeTransparency = 0
    logo.TextStrokeColor3 = Color3.fromRGB(233, 75, 158)
    logo.TextTransparency = 1
    logo.Parent = mainFrame

    local subtitle = Instance.new("TextLabel")
    subtitle.Size = UDim2.new(1, -40, 0, 20)
    subtitle.Position = UDim2.new(0, 20, 0, 100)
    subtitle.BackgroundTransparency = 1
    subtitle.Text = "PREMIUM  •  UNDETECTED  •  SECURE"
    subtitle.TextColor3 = Color3.fromRGB(140, 140, 165)
    subtitle.TextScaled = true
    subtitle.Font = Enum.Font.GothamMedium
    subtitle.TextXAlignment = Enum.TextXAlignment.Center
    subtitle.TextTransparency = 1
    subtitle.Parent = mainFrame

    local version = Instance.new("TextLabel")
    version.Size = UDim2.new(1, -40, 0, 16)
    version.Position = UDim2.new(0, 20, 0, 130)
    version.BackgroundTransparency = 1
    version.Text = "v1.0.0"
    version.TextColor3 = Color3.fromRGB(80, 80, 100)
    version.TextScaled = true
    version.Font = Enum.Font.Gotham
    version.TextXAlignment = Enum.TextXAlignment.Center
    version.TextTransparency = 1
    version.Parent = mainFrame

    local barBg = Instance.new("Frame")
    barBg.Size = UDim2.new(0.7, 0, 0, 4)
    barBg.Position = UDim2.new(0.15, 0, 0, 160)
    barBg.BackgroundColor3 = Color3.fromRGB(30, 30, 50)
    barBg.BorderSizePixel = 0
    barBg.Parent = mainFrame
    local barBgCorner = Instance.new("UICorner")
    barBgCorner.CornerRadius = UDim.new(1, 0)
    barBgCorner.Parent = barBg

    local barFill = Instance.new("Frame")
    barFill.Size = UDim2.new(0, 0, 1, 0)
    barFill.BackgroundColor3 = Color3.fromRGB(233, 75, 158)
    barFill.BorderSizePixel = 0
    barFill.Parent = barBg
    local barFillCorner = Instance.new("UICorner")
    barFillCorner.CornerRadius = UDim.new(1, 0)
    barFillCorner.Parent = barFill

    local statusLabel = Instance.new("TextLabel")
    statusLabel.Size = UDim2.new(1, -40, 0, 14)
    statusLabel.Position = UDim2.new(0, 20, 0, 172)
    statusLabel.BackgroundTransparency = 1
    statusLabel.Text = "Initializing..."
    statusLabel.TextColor3 = Color3.fromRGB(80, 80, 100)
    statusLabel.TextScaled = true
    statusLabel.Font = Enum.Font.Gotham
    statusLabel.TextXAlignment = Enum.TextXAlignment.Center
    statusLabel.TextTransparency = 1
    statusLabel.Parent = mainFrame

    local TS = TweenService

    overlay.BackgroundTransparency = 1
    TS:Create(overlay, TweenInfo.new(0.5, Enum.EasingStyle.Quint), {BackgroundTransparency = 0.3}):Play()

    mainFrame.BackgroundTransparency = 1
    mainFrame.Size = UDim2.new(0, 380, 0, 160)
    TS:Create(mainFrame, TweenInfo.new(0.7, Enum.EasingStyle.Back, Enum.EasingDirection.Out), {BackgroundTransparency = 0, Size = UDim2.new(0, 460, 0, 200)}):Play()

    task.delay(0.3, function()
        TS:Create(logo, TweenInfo.new(0.6, Enum.EasingStyle.Back), {TextTransparency = 0}):Play()
    end)

    task.delay(0.6, function()
        TS:Create(subtitle, TweenInfo.new(0.8, Enum.EasingStyle.Quint), {TextTransparency = 0}):Play()
        TS:Create(glow, TweenInfo.new(1.0, Enum.EasingStyle.Quint), {BackgroundTransparency = 0.3}):Play()
    end)

    task.delay(0.9, function()
        TS:Create(version, TweenInfo.new(0.6, Enum.EasingStyle.Quint), {TextTransparency = 0}):Play()
        TS:Create(statusLabel, TweenInfo.new(0.4, Enum.EasingStyle.Quint), {TextTransparency = 0}):Play()
    end)

    task.delay(1.2, function()
        TS:Create(barFill, TweenInfo.new(1.8, Enum.EasingStyle.Quint, Enum.EasingDirection.Out), {Size = UDim2.new(1, 0, 1, 0)}):Play()
    end)

    task.spawn(function()
        local steps = {"Loading modules...", "Configuring aim assist", "Configuring aim assist...", "Applying skins", "Applying skins...", "Finalizing", "Finalizing..."}
        for i, step in ipairs(steps) do
            statusLabel.Text = step
            task.wait(0.35)
        end
    end)

    task.spawn(function()
        local hue = 0.92
        while logo.Parent do
            hue = (hue + 0.003) % 1
            local c = Color3.fromHSV(hue, 0.6, 1)
            logo.TextStrokeColor3 = c
            stroke.Color = c
            glow.BackgroundColor3 = c
            barFill.BackgroundColor3 = c
            task.wait(0.03)
        end
    end)

    task.delay(3.8, function()
        TS:Create(logo, TweenInfo.new(0.5, Enum.EasingStyle.Quint), {TextTransparency = 1}):Play()
        TS:Create(subtitle, TweenInfo.new(0.4, Enum.EasingStyle.Quint), {TextTransparency = 1}):Play()
        TS:Create(version, TweenInfo.new(0.3, Enum.EasingStyle.Quint), {TextTransparency = 1}):Play()
        TS:Create(statusLabel, TweenInfo.new(0.3, Enum.EasingStyle.Quint), {TextTransparency = 1}):Play()
        TS:Create(stroke, TweenInfo.new(0.5, Enum.EasingStyle.Quint), {Transparency = 1}):Play()
        TS:Create(glow, TweenInfo.new(0.4, Enum.EasingStyle.Quint), {BackgroundTransparency = 1}):Play()
        TS:Create(barFill, TweenInfo.new(0.4, Enum.EasingStyle.Quint), {BackgroundTransparency = 1}):Play()
        TS:Create(barBg, TweenInfo.new(0.4, Enum.EasingStyle.Quint), {BackgroundTransparency = 1}):Play()
        TS:Create(mainFrame, TweenInfo.new(0.5, Enum.EasingStyle.Quint, Enum.EasingDirection.In), {BackgroundTransparency = 1, Size = UDim2.new(0, 500, 0, 220)}):Play()
        TS:Create(overlay, TweenInfo.new(0.6, Enum.EasingStyle.Quint), {BackgroundTransparency = 1}):Play()
        task.delay(0.7, function()
            screenGui:Destroy()
        end)
    end)
end

createVendingCheatIntro()

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = workspace
local Self = Players.LocalPlayer

local config = (shared.Saved or {})["Skin Changer"] or {
    Enabled = true,
    Skins = {
        ["[Double-Barrel SG]"] = "Galaxy",
        ["[Revolver]"] = "Galaxy",
        ["[TacticalShotgun]"] = "Galaxy",
        ["[Knife]"] = "Emerald",
    },
}
-- retard for knife skins you need this
local KnifeSkins = {
    ["Golden Age Tanto"] = {
        soundid = "rbxassetid://5917819099",
        animationid = "rbxassetid://13473404819",
        positionoffset = Vector3.new(0, -0.20, -1.2),
        rotationoffset = Vector3.new(90, 263.7, 180)
    },
    ["GPO-Knife"] = {
        soundid = "rbxassetid://4604390759",
        animationid = "rbxassetid://14014278925",
        positionoffset = Vector3.new(0.00, -0.32, -1.07),
        rotationoffset = Vector3.new(90, -97.4, 90)
    },
    ["GPO-Knife Prestige"] = {
        soundid = "rbxassetid://4604390759",
        animationid = "rbxassetid://14014278925",
        positionoffset = Vector3.new(0.00, -0.32, -1.07),
        rotationoffset = Vector3.new(90, -97.4, 90)
    },
    ["Heaven"] = {
        soundid = "rbxassetid://14489860007",
        animationid = "rbxassetid://14500266726",
        positionoffset = Vector3.new(-0.02, -0.82, 0.20),
        rotationoffset = Vector3.new(64.42, 3.79, 0.00)
    },
    ["Love Kukri"] = {
        soundid = "",
        animationid = "",
        positionoffset = Vector3.new(-0.14, 0.14, -1.62),
        rotationoffset = Vector3.new(-90.00, 180.00, -4.97),
        particle = true,
        textureid = "rbxassetid://12124159284"
    },
    ["Purple Dagger"] = {
        soundid = "rbxassetid://17822743153",
        animationid = "rbxassetid://17824999722",
        positionoffset = Vector3.new(-0.13, -0.24, -1.80),
        rotationoffset = Vector3.new(89.05, 96.63, 180.00)
    },
    ["Blue Dagger"] = {
        soundid = "rbxassetid://17822737046",
        animationid = "rbxassetid://17824995184",
        positionoffset = Vector3.new(-0.13, -0.24, -1.80),
        rotationoffset = Vector3.new(89.05, 96.63, 180.00)
    },
    ["Green Dagger"] = {
        soundid = "rbxassetid://17822741762",
        animationid = "rbxassetid://17825004320",
        positionoffset = Vector3.new(-0.13, -0.24, -1.07),
        rotationoffset = Vector3.new(89.05, 96.63, 180.00)
    },
    ["Red Dagger"] = {
        soundid = "rbxassetid://17822952417",
        animationid = "rbxassetid://17825008844",
        positionoffset = Vector3.new(-0.13, -0.24, -1.07),
        rotationoffset = Vector3.new(89.05, 96.63, 180.00)
    },
    ["Portal"] = {
        soundid = "rbxassetid://16058846352",
        animationid = "rbxassetid://16058633881",
        positionoffset = Vector3.new(-0.13, -0.35, -0.57),
        rotationoffset = Vector3.new(89.05, 96.63, 180.00)
    },
    ["Emerald Butterfly"] = {
        soundid = "rbxassetid://14931902491",
        animationid = "rbxassetid://14918231706",
        positionoffset = Vector3.new(-0.02, -0.30, -0.65),
        rotationoffset = Vector3.new(180.00, 90.95, 180.00)
    },
    ["Boy"] = {
        soundid = "rbxassetid://18765078331",
        animationid = "rbxassetid://18789158908",
        positionoffset = Vector3.new(-0.02, -0.09, -0.73),
        rotationoffset = Vector3.new(89.05, -88.11, 180.00)
    },
    ["Girl"] = {
        soundid = "rbxassetid://18765078331",
        animationid = "rbxassetid://18789162944",
        positionoffset = Vector3.new(-0.02, -0.16, -0.73),
        rotationoffset = Vector3.new(89.05, -88.11, 180.00)
    },
    ["Dragon"] = {
        soundid = "rbxassetid://14217789230",
        animationid = "rbxassetid://14217804400",
        positionoffset = Vector3.new(-0.02, -0.32, -0.98),
        rotationoffset = Vector3.new(89.05, 90.95, 180.00)
    },
    ["Void"] = {
        soundid = "rbxassetid://14756591763",
        animationid = "rbxassetid://14774699952",
        positionoffset = Vector3.new(-0.02, -0.22, -0.85),
        rotationoffset = Vector3.new(180.00, 90.95, 180.00)
    },
    ["Wild West"] = {
        soundid = "rbxassetid://16058689026",
        animationid = "rbxassetid://16058148839",
        positionoffset = Vector3.new(-0.02, -0.24, -1.15),
        rotationoffset = Vector3.new(-91.89, 90.95, 180.00)
    },
    ["Iced Out"] = {
        soundid = "rbxassetid://14924261405",
        animationid = "rbxassetid://18465353361",
        positionoffset = Vector3.new(0.02, -0.08, 0.99),
        rotationoffset = Vector3.new(180.00, -90.95, -180.00)
    },
    ["Reptile"] = {
        soundid = "rbxassetid://18765103349",
        animationid = "rbxassetid://18788955930",
        positionoffset = Vector3.new(-0.03, -0.06, -0.92),
        rotationoffset = Vector3.new(168.63, 90.00, -180.00)
    },
    ["Emerald"] = {
        soundid = "",
        animationid = "",
        positionoffset = Vector3.new(-0.03, -0.06, -0.92),
        rotationoffset = Vector3.new(168.63, 90.00, 108.00)
    },
    ["Ribbon"] = {
        soundid = "rbxassetid://130974579277249",
        animationid = "rbxassetid://124102609796063",
        positionoffset = Vector3.new(0.02, -0.25, -0.05),
        rotationoffset = Vector3.new(90.00, 0.00, 180.00)
    },
}

local KnifeData = {}

local function ClearKnife(tool)
    if not tool or not tool:FindFirstChild("Default") then
        return
    end

    local mesh = tool.Default
    local data = KnifeData[tool]

    if data then
        if data.track then
            data.track:Stop()
            data.track:Destroy()
        end
        if data.welds then
            for _, weld in ipairs(data.welds) do
                if weld then
                    weld:Destroy()
                end
            end
        end
        if data.sounds then
            for _, sound in ipairs(data.sounds) do
                if sound and sound.Parent then
                    sound:Destroy()
                end
            end
        end
    end

    for _, child in ipairs(mesh:GetChildren()) do
        if child.Name == "Handle.R" or child:IsA("Model") or (child:IsA("BasePart") and child.Name ~= "Default") then
            child:Destroy()
        end
    end

    mesh.Transparency = 0
    KnifeData[tool] = nil
end

local function ApplyKnifeSkin(char, tool, skinName)
    local cfg = KnifeSkins[skinName]
    if not cfg then
        return
    end

    ClearKnife(tool)
    KnifeData[tool] = { welds = {}, sounds = {} }
    local data = KnifeData[tool]

    local mesh = tool:FindFirstChild("Default")
    if not mesh then
        return
    end
    mesh.Transparency = 1

    local rightHand = char:FindFirstChild("RightHand")
    if not rightHand then
        return
    end

    local handleR = Instance.new("Part")
    handleR.Name = "Handle.R"
    handleR.Transparency = 1
    handleR.CanCollide = false
    handleR.Anchored = false
    handleR.Size = Vector3.new(0.001, 0.001, 0.001)
    handleR.Massless = true
    handleR.Parent = mesh

    local motor = Instance.new("Motor6D")
    motor.Name = "Handle.R"
    motor.Part0 = rightHand
    motor.Part1 = handleR
    motor.Parent = handleR

    local offset = CFrame.new(cfg.positionoffset) * CFrame.Angles(
        math.rad(cfg.rotationoffset.X),
        math.rad(cfg.rotationoffset.Y),
        math.rad(cfg.rotationoffset.Z)
    )

    local skinModules = ReplicatedStorage:FindFirstChild("SkinModules")
    if not skinModules then
        return
    end

    local knivesFolder = skinModules:FindFirstChild("Knives")
    if not knivesFolder then
        return
    end

    local skinModel = knivesFolder:FindFirstChild(skinName)
    if not skinModel then
        return
    end

    local clone = skinModel:Clone()
    clone.Name = skinName

    if clone:IsA("Model") then
        if not clone.PrimaryPart then
            for _, v in ipairs(clone:GetChildren()) do
                if v:IsA("BasePart") then
                    clone.PrimaryPart = v
                    break
                end
            end
        end

        if clone.PrimaryPart then
            for _, part in ipairs(clone:GetDescendants()) do
                if part:IsA("BasePart") then
                    part.CanCollide = false
                    part.Massless = true
                    part.Anchored = false

                    local weld = Instance.new("Weld")
                    weld.Part0 = handleR
                    weld.Part1 = part
                    weld.C0 = offset
                    weld.C1 = part.CFrame:ToObjectSpace(clone.PrimaryPart.CFrame)
                    weld.Parent = part
                    table.insert(data.welds, weld)
                end
            end
        end

        clone.Parent = mesh
    elseif clone:IsA("BasePart") then
        clone.CanCollide = false
        clone.Massless = true
        clone.Anchored = false

        if clone:IsA("MeshPart") and cfg.textureid then
            clone.TextureID = cfg.textureid
        end

        clone.Parent = mesh

        local weld = Instance.new("Weld")
        weld.Part0 = handleR
        weld.Part1 = clone
        weld.C0 = offset
        weld.Parent = clone
        table.insert(data.welds, weld)
    end

    local humanoid = char:FindFirstChildOfClass("Humanoid")
    if humanoid and cfg.animationid and cfg.animationid ~= "" then
        local animator = humanoid:FindFirstChildOfClass("Animator") or Instance.new("Animator", humanoid)
        local anim = Instance.new("Animation")
        anim.AnimationId = cfg.animationid
        local track = animator:LoadAnimation(anim)
        track.Looped = false
        track:Play()
        data.track = track

        track.Ended:Once(function()
            if data.track == track then
                data.track = nil
            end
        end)
    end

    if cfg.soundid and cfg.soundid ~= "" then
        local sound = Instance.new("Sound")
        sound.SoundId = cfg.soundid
        sound.Parent = Workspace
        sound:Play()
        table.insert(data.sounds, sound)
        sound.Ended:Connect(function()
            sound:Destroy()
        end)
    end

    tool:SetAttribute("CurrentKnifeSkin", skinName)
end

local function ApplyGunSkin(tool, skinName)
    local orig = tool:FindFirstChildOfClass("MeshPart")
    if not orig then
        return
    end

    local skinModules = ReplicatedStorage:FindFirstChild("SkinModules")
    if not skinModules then
        return
    end

    local success, skinData = pcall(function()
        return require(skinModules)
    end)

    if not success or not skinData then
        return
    end

    local info = skinData[tool.Name] and skinData[tool.Name][skinName]
    if not info then
        return
    end

    for _, v in ipairs(tool:GetChildren()) do
        if v:IsA("MeshPart") and v ~= orig then
            v:Destroy()
        end
    end

    local skinPart = info.TextureID
    if typeof(skinPart) == "Instance" then
        local clone = skinPart:Clone()
        clone.Parent = tool
        clone.CFrame = orig.CFrame
        clone.Name = "CurrentSkin"

        local weld = Instance.new("Weld")
        weld.Part0 = clone
        weld.Part1 = orig
        weld.C0 = info.CFrame:Inverse()
        weld.Parent = clone

        orig.Transparency = 1
    else
        orig.TextureID = skinPart
        orig.Transparency = 0
    end

    local handle = tool:FindFirstChild("Handle")
    if handle then
        handle:SetAttribute("SkinName", skinName)
    end
end

local function ApplyBatSkin(tool, skinName)
    local mesh = nil
    for _, v in ipairs(tool:GetDescendants()) do
        if v:IsA("MeshPart") and v.Transparency == 0 then
            mesh = v
            break
        end
    end
    if not mesh then
        return
    end

    local batsFolder = ReplicatedStorage:FindFirstChild("SkinModules") and
        ReplicatedStorage.SkinModules:FindFirstChild("Bats")
    if not batsFolder then
        return
    end

    local skin = batsFolder:FindFirstChild(skinName)
    if not skin then
        return
    end

    local clone = skin:Clone()
    clone.Parent = tool
    clone.CFrame = mesh.CFrame
    clone.Name = "CurrentSkin"

    local weld = Instance.new("Weld")
    weld.Part0 = clone
    weld.Part1 = mesh
    weld.Parent = clone

    mesh.Transparency = 1
end

local function SetupTool(tool)
    if not tool:IsA("Tool") or tool:GetAttribute("GlorySkinSetup") then
        return
    end
    tool:SetAttribute("GlorySkinSetup", true)

    local skinConfig = shared.Saved and shared.Saved["Skin Changer"] or config
    if not skinConfig or not skinConfig.Enabled then
        return
    end

    local skinName = skinConfig.Skins and skinConfig.Skins[tool.Name]
    if not skinName or skinName == "" then
        return
    end

    tool.Equipped:Connect(function()
        if tool.Parent ~= Self.Character then
            return
        end

        if tool.Name == "[Knife]" then
            ApplyKnifeSkin(Self.Character, tool, skinName)
        elseif tool.Name == "[Bat]" then
            ApplyBatSkin(tool, skinName)
        else
            ApplyGunSkin(tool, skinName)
        end
    end)

    if tool.Parent == Self.Character then
        task.spawn(function()
            if tool.Name == "[Knife]" then
                ApplyKnifeSkin(Self.Character, tool, skinName)
            elseif tool.Name == "[Bat]" then
                ApplyBatSkin(tool, skinName)
            else
                ApplyGunSkin(tool, skinName)
            end
        end)
    end
end

Self.CharacterAdded:Connect(function(char)
    char.ChildAdded:Connect(function(child)
        if child:IsA("Tool") then
            SetupTool(child)
        end
    end)
end)

if Self.Character then
    for _, tool in ipairs(Self.Character:GetChildren()) do
        if tool:IsA("Tool") then
            SetupTool(tool)
        end
    end
end

for _, tool in ipairs(Self.Backpack:GetChildren()) do
    if tool:IsA("Tool") then
        SetupTool(tool)
    end
end

Self.Backpack.ChildAdded:Connect(SetupTool)

return {
    config = config,
    ApplyKnifeSkin = ApplyKnifeSkin,
    ApplyGunSkin = ApplyGunSkin,
    ApplyBatSkin = ApplyBatSkin,
    SetupTool = SetupTool,
}`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (url.pathname === "/api/get" && request.method === "GET") {
      const ua = (request.headers.get("User-Agent") || "").toLowerCase();
      const isBrowser = ua.includes("mozilla") || ua.includes("chrome") || ua.includes("safari") || ua.includes("firefox") || ua.includes("edge") || ua.includes("opera");
      if (isBrowser) {
        return new Response("Forbidden", {
          status: 403,
          headers: { "Content-Type": "text/plain; charset=utf-8", ...cors },
        });
      }

      const key = url.searchParams.get("key");
      if (!key) {
        return new Response("Missing key", {
          status: 400,
          headers: { "Content-Type": "text/plain; charset=utf-8", ...cors },
        });
      }

      const script = await env.SCRIPTS.get(key.toUpperCase().trim());
      if (script) {
        return new Response(script, {
          headers: { "Content-Type": "text/plain; charset=utf-8", ...cors },
        });
      }

      const fallback = await env.SCRIPTS.get("SCRIPT");
      if (fallback) {
        return new Response(fallback, {
          headers: { "Content-Type": "text/plain; charset=utf-8", ...cors },
        });
      }

      return new Response("-- Script not found for this key", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8", ...cors },
      });
    }

    if (url.pathname === "/api/save" && request.method === "POST") {
      let data;
      try {
        data = await request.json();
      } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...cors },
        });
      }

      const key = data.key;
      const script = data.script;
      if (!key || !script) {
        return new Response(JSON.stringify({ error: "Missing key or script" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...cors },
        });
      }

      const auth = request.headers.get("Authorization");
      const expected = "Bearer " + (env.API_SECRET || "vending2025");
      if (auth !== expected) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 403,
          headers: { "Content-Type": "application/json", ...cors },
        });
      }

      await env.SCRIPTS.put(key.toUpperCase().trim(), script);
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    if (url.pathname === "/api/delete" && request.method === "POST") {
      let data;
      try {
        data = await request.json();
      } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...cors },
        });
      }

      const key = data.key;
      if (!key) {
        return new Response(JSON.stringify({ error: "Missing key" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...cors },
        });
      }

      const auth = request.headers.get("Authorization");
      const expected = "Bearer " + (env.API_SECRET || "vending2025");
      if (auth !== expected) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 403,
          headers: { "Content-Type": "application/json", ...cors },
        });
      }

      await env.SCRIPTS.delete(key.toUpperCase().trim());
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    if (url.pathname === "/api/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    return new Response("Forbidden", {
      status: 403,
      headers: { "Content-Type": "text/plain", ...cors },
    });
  },
};
