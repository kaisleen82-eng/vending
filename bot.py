import os
import sys
import json as json_module
import time
import platform
from datetime import datetime

import discord
from discord import app_commands
from discord.ext import commands

from config import BOT_TOKEN, ADMIN_IDS, APP_NAME, VERSION
from hwid import get_hwid
from keys import (
    generate_keys, check_key, revoke_key, list_keys,
    get_stats, get_key_info, KEY_TYPES, redeem_key,
    register_key, login_key
)
from crypto import encrypt_lua_script, generate_secure_decoder

DARK = discord.Color.from_rgb(30, 31, 38)
COMPONENTS_V2_FLAG = 32768
PINK_COLOR = 0xE94B9E


def get_logo_file():
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logo.png")
    if os.path.exists(path):
        return discord.File(path, filename="logo.png")
    return None


def set_thumb(embed):
    embed.set_thumbnail(url="attachment://logo.png")
    return embed


def load_lua_body():
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "luabody.txt")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    return ""


def build_config_header():
    return """local Config = {
    ['Conditions'] = {
        Knocked = true,
        Reloading = true,
        Visible = true,
        Protected = true,
    },
    ['Silent Aimbot'] = {
        ['Enabled'] = false,
        ['HitPart'] = 'ClosestPoint',
        ['Prediction'] = { { X = 0, Y = 0, Z = 0 } },
        ['Closest Point'] = { ['Mode'] = 'Advanced', ['SubDivisions'] = 3 },
        ['FOV'] = { ['X'] = 15, ['Y'] = 15, ['Z'] = 15 },
    },
    ['Camera Aimbot'] = {
        ['Enabled'] = false,
        ['Part'] = 'ClosestPart',
        ['Configurations'] = {
            ['Snappiness'] = 0.041,
            ['Prediction'] = { { X = 0, Y = 0, Z = 0 } },
            ['Bind'] = { Key = 'H', Mode = 'Toggle' },
        },
        ['FOV'] = { ['X'] = 50, ['Y'] = 50, ['Z'] = 50 },
    },
    ['Trigger Bot'] = {
        ['Enabled'] = false,
        ['Keybind'] = { Key = 'V', Mode = 'Hold' },
        ['Config'] = { ['Part'] = 'ClosestPart', ['Mode'] = 'Normal' },
        ['Start'] = 0.02,
        ['End'] = 0.08,
    },
    ['Spread Modifications'] = {
        ['Enabled'] = false,
        ['Method'] = 'randomized',
        ['DoubleBarrelSG'] = { ['Spread'] = 0.75, ['Random'] = { ['Min'] = 0.75, ['Max'] = 0.75 } },
        ['TacticalShotgun'] = { ['Spread'] = 0.75, ['Random'] = { ['Min'] = 0.75, ['Max'] = 0.75 } },
        ['DrumShotgun'] = { ['Spread'] = 0, ['Random'] = { ['Min'] = 0, ['Max'] = 0 } },
    },
    ['Hitbox Expander'] = {
        ['Enabled'] = false,
        ['Config'] = {
            ['[Double-Barrel SG]'] = { H = 2, W = 2 },
            ['[Revolver]'] = { H = 2, W = 2 },
            ['[Tactical SG]'] = { H = 2, W = 2 },
        },
    },
    ['Normal Macro'] = {
        ['Enabled'] = false,
        ['Keybind'] = { Key = 'Q', Mode = 'Hold' },
        ['Delay'] = 0.020,
        ['Mode'] = 'FirstPerson',
    },
    ['Noclip Macro'] = {
        ['Enabled'] = false,
        ['Keybind'] = { Key = 'B', Mode = 'Hold' },
        ['Delay'] = 0.03,
        ['Slot'] = 3,
    },
}

shared.Saved = shared.Saved or {}
shared.Saved['Skin Changer'] = {
    Enabled = true,
    Skins = {
        ['[Double-Barrel SG]'] = 'Galaxy',
        ['[Revolver]'] = 'Galaxy',
        ['[TacticalShotgun]'] = 'Galaxy',
        ['[Knife]'] = 'Emerald',
    },
}
shared.Saved['ESP'] = {
    Enabled = false,
    Box = true,
    Name = true,
    Health = true,
    Distance = true,
    Tracers = false,
    TeamCheck = true,
    BoxType = 'Corner',
    MaxDistance = 1000,
}

"""


bot = commands.Bot(command_prefix="!", intents=discord.Intents.default())
start_time = time.time()


def is_admin(user_id):
    return len(ADMIN_IDS) == 0 or user_id in ADMIN_IDS


# ── V2 Panel Builder ──


def build_v2_panel():
    return [
        {
            "type": 17,
            "accent_color": PINK_COLOR,
            "components": [
                {"type": 10, "content": "# VENDING"},
                {"type": 14, "spacing": 1, "divider": True},
                {"type": 10, "content": (
                    "**Register** - Redeem your license key to activate access\n"
                    "**Log In** - Log in to your account\n"
                    "**Get Link** - Download your loader script file\n"
                    "**Reset HWID** - Reset your HWID to use on another device\n"
                    "**Get Role** - Get your verified role in the server\n"
                    "**Support** - Open a support ticket"
                )},
                {"type": 14, "spacing": 1, "divider": True},
                {
                    "type": 1,
                    "components": [
                        {"type": 2, "label": "Register", "style": 2, "custom_id": "panel_register",
                         "emoji": {"name": "register", "id": 1524839464403468379}},
                        {"type": 2, "label": "Log In", "style": 2, "custom_id": "panel_login",
                         "emoji": {"name": "support", "id": 1508992876200202442}},
                        {"type": 5, "label": "Get Link", "url": "https://vending-theta.vercel.app/",
                         "emoji": {"name": "chief", "id": 1524015793950556311}},
                    ]
                },
                {
                    "type": 1,
                    "components": [
                        {"type": 2, "label": "Reset HWID", "style": 2, "custom_id": "panel_resethwid",
                         "emoji": {"name": "reset", "id": 1524839420644294789}},
                        {"type": 2, "label": "Get Role", "style": 2, "custom_id": "panel_getrole",
                         "emoji": {"name": "community", "id": 1278572944393633793}},
                        {"type": 2, "label": "Support", "style": 2, "custom_id": "panel_support"},
                    ]
                },
                {"type": 14, "spacing": 1, "divider": True},
                {"type": 10, "content": f"**{APP_NAME}** | Key System"}
            ]
        }
    ]


def build_v2_admin_panel():
    return [
        {
            "type": 17,
            "accent_color": PINK_COLOR,
            "components": [
                {"type": 10, "content": "# VENDING - Admin"},
                {"type": 14, "spacing": 1, "divider": True},
                {"type": 10, "content": (
                    "**Generate Keys** - Generate new license keys\n"
                    "**Manage Keys** - View key statistics\n"
                    "**Bot Status** - Check bot uptime and stats"
                )},
                {"type": 14, "spacing": 1, "divider": True},
                {
                    "type": 1,
                    "components": [
                        {"type": 2, "label": "Generate Keys", "style": 2, "custom_id": "admin_genkeys"},
                        {"type": 2, "label": "Manage Keys", "style": 2, "custom_id": "admin_managekeys"},
                        {"type": 2, "label": "Bot Status", "style": 2, "custom_id": "admin_status"},
                    ]
                },
                {"type": 14, "spacing": 1, "divider": True},
                {"type": 10, "content": f"**{APP_NAME}** | Admin"}
            ]
        }
    ]


async def send_v2(interaction, components, file=None):
    route = discord.http.Route(
        "POST",
        "/interactions/{interaction_id}/{interaction_token}/callback",
        interaction_id=interaction.id,
        interaction_token=interaction.token
    )
    payload = {"type": 4, "data": {"flags": COMPONENTS_V2_FLAG, "components": components}}
    if file:
        import io
        raw = file.fp.read()
        file.fp.seek(0)
        form = [
            {"name": "payload_json", "value": json_module.dumps(payload), "content_type": "application/json"},
            {"name": "files[0]", "value": raw, "filename": file.filename, "content_type": "image/png"},
        ]
        await bot.http.request(route, form=form)
    else:
        await bot.http.request(route, json=payload)


# ── Modals ──


class RegisterModal(discord.ui.Modal, title="Register"):
    username = discord.ui.TextInput(label="Username", placeholder="Choose a username", required=True, max_length=24)
    password = discord.ui.TextInput(label="Password", placeholder="Choose a password", required=True)
    license_key = discord.ui.TextInput(label="License Key", placeholder="VEN-XXXXX-XXXXX-...", required=True)

    async def on_submit(self, interaction: discord.Interaction):
        key = self.license_key.value.upper().strip()
        result = register_key(key, self.username.value, self.password.value)

        if result["success"]:
            embed = discord.Embed(
                title="Registered",
                description=(
                    f"**Username:** `{self.username.value}`\n"
                    f"**Password:** `{self.password.value}`\n"
                    f"**Key:** `{key}`\n"
                    f"**Type:** {result['info'].get('type_label', 'N/A')}"
                ),
                color=DARK
            )
            embed.set_footer(text=f"{APP_NAME} | Key System")
            f = get_logo_file()
            kwargs = {"embed": embed, "ephemeral": True}
            if f:
                kwargs["file"] = f
            await interaction.response.send_message(**kwargs)

            try:
                dm_embed = discord.Embed(
                    title="VENDING - Your Credentials",
                    description=(
                        f"Here are your login details:\n\n"
                        f"**Username:** `{self.username.value}`\n"
                        f"**Password:** `{self.password.value}`\n"
                        f"**Key:** `{key}`\n"
                        f"**Type:** {result['info'].get('type_label', 'N/A')}\n\n"
                        f"Use these to log in on the dashboard."
                    ),
                    color=DARK
                )
                dm_embed.set_footer(text=f"{APP_NAME} | Key System")
                f2 = get_logo_file()
                dm_kwargs = {"embed": dm_embed}
                if f2:
                    dm_kwargs["file"] = f2
                await interaction.user.send(**dm_kwargs)
            except discord.Forbidden:
                pass
        else:
            embed = discord.Embed(title="Registration Failed", description=result["reason"], color=discord.Color.red())
            embed.set_footer(text=f"{APP_NAME} | Key System")
            await interaction.response.send_message(embed=embed, ephemeral=True)


class LoginModal(discord.ui.Modal, title="Log In"):
    username = discord.ui.TextInput(label="Username", placeholder="Your username", required=True)
    password = discord.ui.TextInput(label="Password", placeholder="Your password", required=True)
    license_key = discord.ui.TextInput(label="License Key", placeholder="VEN-XXXXX-XXXXX-...", required=True)

    async def on_submit(self, interaction: discord.Interaction):
        key = self.license_key.value.upper().strip()
        result = login_key(key, self.username.value, self.password.value)

        if result["valid"]:
            info = result["info"]
            embed = discord.Embed(
                title="Logged In",
                description=(
                    f"Welcome back, **{self.username.value}**.\n\n"
                    f"**Key:** `{key}`\n"
                    f"**Type:** {info.get('type_label', 'N/A')}"
                ),
                color=DARK
            )
        else:
            embed = discord.Embed(title="Login Failed", description=result["reason"], color=discord.Color.red())
        embed.set_footer(text=f"{APP_NAME} | Key System")
        await interaction.response.send_message(embed=embed, ephemeral=True)


class ResetHWIDModal(discord.ui.Modal, title="Reset HWID"):
    license_key = discord.ui.TextInput(label="License Key", placeholder="VEN-XXXXX-XXXXX-...", required=True)
    reason = discord.ui.TextInput(label="Reason", placeholder="Why do you need a reset?", required=True, style=discord.TextStyle.long)

    async def on_submit(self, interaction: discord.Interaction):
        embed = discord.Embed(
            title="HWID Reset Request",
            description="Your request has been submitted to an admin.",
            color=DARK
        )
        embed.add_field(name="Key", value=f"`{self.license_key.value.upper().strip()}`", inline=True)
        embed.add_field(name="Reason", value=self.reason.value, inline=False)
        embed.set_footer(text=f"{APP_NAME} | Requested by {interaction.user}")

        log_channel = discord.utils.get(interaction.guild.channels, name="hwid-logs")
        if log_channel:
            await log_channel.send(embed=embed)

        await interaction.response.send_message(embed=embed, ephemeral=True)


# ── Events ──


@bot.event
async def on_ready():
    print(f"Logged in as {bot.user} (ID: {bot.user.id})")
    try:
        synced = await bot.tree.sync()
        print(f"Synced {len(synced)} slash commands")
    except Exception as e:
        print(f"Failed to sync commands: {e}")
    await bot.change_presence(activity=discord.Activity(type=discord.ActivityType.playing, name="VENDING"))


@bot.event
async def on_interaction(interaction):
    if interaction.type != discord.InteractionType.component:
        return

    custom_id = interaction.data.get("custom_id", "")

    if custom_id == "panel_register":
        await interaction.response.send_modal(RegisterModal())

    elif custom_id == "panel_login":
        await interaction.response.send_modal(LoginModal())

    elif custom_id == "panel_resethwid":
        await interaction.response.send_modal(ResetHWIDModal())

    elif custom_id == "panel_getrole":
        member = interaction.guild.get_member(interaction.user.id)
        role = discord.utils.get(interaction.guild.roles, name="Verified")
        if role:
            if role in member.roles:
                embed = discord.Embed(title="Already Roled", description="You already have the Buyer role.", color=DARK)
            else:
                await member.add_roles(role)
                embed = discord.Embed(title="Role Assigned", description="You now have the **Buyer** role.", color=DARK)
        else:
            embed = discord.Embed(title="Role Not Found", description="The *Buyer* role does not exist.", color=discord.Color.red())
        embed.set_footer(text=f"{APP_NAME} | Key System")
        await interaction.response.send_message(embed=embed, ephemeral=True)

    elif custom_id == "panel_support":
        support_components = [
            {
                "type": 17,
                "accent_color": PINK_COLOR,
                "components": [
                    {"type": 10, "content": "# VENDING | Tickets"},
                    {"type": 14, "spacing": 1, "divider": True},
                    {"type": 10, "content": (
                        "Need help? Open a support ticket and an admin will assist you.\n\n"
                        "Select a category below to get started."
                    )},
                    {"type": 14, "spacing": 1, "divider": True},
                    {
                        "type": 1,
                        "components": [
                            {
                                "type": 3,
                                "custom_id": "support_select",
                                "placeholder": "Select a category...",
                                "min_values": 1,
                                "max_values": 1,
                                "options": [
                                    {"label": "Purchase", "description": "Help with buying or renewing your key", "value": "purchase"},
                                    {"label": "Support", "description": "Technical issues or general help", "value": "support"},
                                    {"label": "Refund", "description": "Request a refund", "value": "refund"},
                                ]
                            }
                        ]
                    },
                    {"type": 14, "spacing": 1, "divider": True},
                    {"type": 10, "content": f"**{APP_NAME}** | Support"}
                ]
            }
        ]
        await send_v2(interaction, support_components)

    elif custom_id == "support_select":
        selected = interaction.data.get("values", ["support"])[0]
        category_labels = {"purchase": "Purchase", "support": "Support", "refund": "Refund"}
        category = category_labels.get(selected, "Support")

        guild = interaction.guild
        if not guild:
            await interaction.response.send_message("Use this in a server.", ephemeral=True)
            return

        overwrites = {
            guild.default_role: discord.PermissionOverwrite(view_channel=False),
            interaction.user: discord.PermissionOverwrite(view_channel=True, send_messages=True, attach_files=True),
            guild.me: discord.PermissionOverwrite(view_channel=True, send_messages=True, manage_channels=True),
        }
        for aid in ADMIN_IDS:
            member = guild.get_member(aid)
            if member:
                overwrites[member] = discord.PermissionOverwrite(view_channel=True, send_messages=True, manage_channels=True)

        category_obj = discord.utils.get(guild.categories, name="Tickets")
        channel = await guild.create_text_channel(
            name=f"ticket-{interaction.user.name}",
            overwrites=overwrites,
            category=category_obj
        )

        ts = f"<t:{int(interaction.created_at.timestamp())}:F>"
        ticket_components = [
            {
                "type": 17,
                "accent_color": PINK_COLOR,
                "components": [
                    {"type": 10, "content": f"# VENDING | {category}"},
                    {"type": 14, "spacing": 1, "divider": True},
                    {"type": 10, "content": (
                        f"**User:** {interaction.user.mention}\n"
                        f"**User ID:** `{interaction.user.id}`\n"
                        f"**Category:** {category}\n"
                        f"**Created:** {ts}"
                    )},
                    {"type": 14, "spacing": 1, "divider": True},
                    {"type": 10, "content": "Describe your issue and an admin will assist you shortly."},
                    {"type": 14, "spacing": 1, "divider": True},
                    {
                        "type": 1,
                        "components": [
                            {"type": 2, "label": "Close Ticket", "style": 4, "custom_id": f"ticket_close_{channel.id}"},
                        ]
                    },
                    {"type": 14, "spacing": 1, "divider": True},
                    {"type": 10, "content": f"**{APP_NAME}** | Support"}
                ]
            }
        ]

        route = discord.http.Route(
            "POST",
            "/channels/{channel_id}/messages",
            channel_id=channel.id
        )
        payload = {"type": 0, "data": {"flags": COMPONENTS_V2_FLAG, "components": ticket_components}}
        f = get_logo_file()
        if f:
            raw = f.fp.read()
            f.fp.seek(0)
            form = [
                {"name": "payload_json", "value": json_module.dumps(payload), "content_type": "application/json"},
                {"name": "files[0]", "value": raw, "filename": "logo.png", "content_type": "image/png"},
            ]
            await bot.http.request(route, form=form)
        else:
            await bot.http.request(route, json=payload)

        await interaction.response.send_message(
            f"Ticket created: {channel.mention}",
            ephemeral=True
        )

    elif custom_id == "admin_genkeys":
        if not is_admin(interaction.user.id):
            await interaction.response.send_message("No permission.", ephemeral=True)
            return
        embed = discord.Embed(
            title="Key Generation",
            description=(
                "Use the slash command:\n\n"
                "`/genkey type:<type> amount:<number> [note:<text>]`\n\n"
                "**Types:** `hourly` `daily` `weekly` `monthly` `lifetime`\n"
                "**Amount:** 1-50"
            ),
            color=DARK
        )
        embed.set_footer(text=f"{APP_NAME} | Admin")
        await interaction.response.send_message(embed=embed, ephemeral=True)

    elif custom_id == "admin_managekeys":
        if not is_admin(interaction.user.id):
            await interaction.response.send_message("No permission.", ephemeral=True)
            return
        stats = get_stats()
        embed = discord.Embed(title="Key Statistics", color=DARK)
        embed.add_field(name="Total", value=str(stats["total"]), inline=True)
        embed.add_field(name="Active", value=str(stats["active"]), inline=True)
        embed.add_field(name="Registered", value=str(stats["registered"]), inline=True)
        embed.add_field(name="Redeemed", value=str(stats["redeemed"]), inline=True)
        embed.add_field(name="Revoked", value=str(stats["revoked"]), inline=True)
        embed.add_field(name="Expired", value=str(stats["expired"]), inline=True)
        if stats["by_type"]:
            type_lines = [f"`{k}`: {v}" for k, v in stats["by_type"].items()]
            embed.add_field(name="By Type", value="\n".join(type_lines), inline=False)
        embed.set_footer(text=f"{APP_NAME} | Admin")
        await interaction.response.send_message(embed=embed, ephemeral=True)

    elif custom_id == "admin_status":
        if not is_admin(interaction.user.id):
            await interaction.response.send_message("No permission.", ephemeral=True)
            return
        uptime_secs = int(time.time() - start_time)
        hours, remainder = divmod(uptime_secs, 3600)
        minutes, seconds = divmod(remainder, 60)
        embed = discord.Embed(title="Bot Status", color=DARK)
        embed.add_field(name="Uptime", value=f"{hours}h {minutes}m {seconds}s", inline=True)
        embed.add_field(name="Latency", value=f"{int(bot.latency * 1000)}ms", inline=True)
        embed.add_field(name="Guilds", value=str(len(bot.guilds)), inline=True)
        embed.set_footer(text=f"{APP_NAME} | Admin")
        await interaction.response.send_message(embed=embed, ephemeral=True)

    elif custom_id.startswith("ticket_close_"):
        if not is_admin(interaction.user.id):
            await interaction.response.send_message("Only admins can close tickets.", ephemeral=True)
            return
        await interaction.response.send_message("Closing ticket in 3 seconds...")
        await time.sleep(3)
        await interaction.channel.delete(reason=f"Ticket closed by {interaction.user}")


@bot.event
async def on_message(message):
    if message.author.bot:
        return
    if isinstance(message.channel, discord.DMChannel):
        content = message.content.strip().upper()
        if content.startswith("VEN-"):
            embed = discord.Embed(
                title="Key Detected",
                description="Use `/register` in the server to create an account, then `/login` to access your script.",
                color=DARK
            )
            embed.set_footer(text=f"{APP_NAME} | Key System")
            f = get_logo_file()
            kwargs = {"embed": embed}
            if f:
                kwargs["file"] = f
            await message.channel.send(**kwargs)
            return
    await bot.process_commands(message)


# ── Slash Commands ──


@bot.tree.command(name="panel", description="Open the control panel")
async def panel(interaction: discord.Interaction):
    f = get_logo_file()
    await send_v2(interaction, build_v2_panel(), f)


@bot.tree.command(name="admin", description="Open the admin panel")
async def admin_panel(interaction: discord.Interaction):
    if not is_admin(interaction.user.id):
        await interaction.response.send_message(
            embed=discord.Embed(title="Access Denied", description="No permission.", color=discord.Color.red()),
            ephemeral=True
        )
        return
    f = get_logo_file()
    await send_v2(interaction, build_v2_admin_panel(), f)


@bot.tree.command(name="register", description="Register your license key")
@app_commands.describe(username="Your username", password="Your password", key="Your license key")
async def register(interaction: discord.Interaction, username: str, password: str, key: str):
    await interaction.response.defer(ephemeral=True)
    key = key.upper().strip()
    result = register_key(key, username, password)
    f = get_logo_file()

    if result["success"]:
        embed = discord.Embed(
            title="Registered",
            description=(
                f"**Username:** `{username}`\n"
                f"**Password:** `{password}`\n"
                f"**Key:** `{key}`\n"
                f"**Type:** {result['info'].get('type_label', 'N/A')}"
            ),
            color=DARK
        )
        embed.set_footer(text=f"{APP_NAME} | Key System")

        try:
            dm_embed = discord.Embed(
                title="VENDING - Your Credentials",
                description=(
                    f"Here are your login details:\n\n"
                    f"**Username:** `{username}`\n"
                    f"**Password:** `{password}`\n"
                    f"**Key:** `{key}`\n"
                    f"**Type:** {result['info'].get('type_label', 'N/A')}\n\n"
                    f"Use these to log in on the dashboard."
                ),
                color=DARK
            )
            dm_embed.set_footer(text=f"{APP_NAME} | Key System")
            if f:
                await interaction.user.send(embed=dm_embed, file=f)
            else:
                await interaction.user.send(embed=dm_embed)
        except discord.Forbidden:
            pass
    else:
        embed = discord.Embed(title="Registration Failed", description=result["reason"], color=discord.Color.red())
        embed.set_footer(text=f"{APP_NAME} | Key System")

    kwargs = {"embed": embed, "ephemeral": True}
    if f:
        kwargs["file"] = f
    await interaction.followup.send(**kwargs)


@bot.tree.command(name="login", description="Log in with your credentials")
@app_commands.describe(username="Your username", password="Your password", key="Your license key")
async def login(interaction: discord.Interaction, username: str, password: str, key: str):
    await interaction.response.defer(ephemeral=True)
    key = key.upper().strip()
    result = login_key(key, username, password)
    f = get_logo_file()

    if result["valid"]:
        info = result["info"]
        embed = discord.Embed(
            title="Logged In",
            description=(
                f"Welcome back, **{username}**.\n\n"
                f"**Key:** `{key}`\n"
                f"**Type:** {info.get('type_label', 'N/A')}"
            ),
            color=DARK
        )
    else:
        embed = discord.Embed(title="Login Failed", description=result["reason"], color=discord.Color.red())
    embed.set_footer(text=f"{APP_NAME} | Key System")

    kwargs = {"embed": embed, "ephemeral": True}
    if f:
        kwargs["file"] = f
    await interaction.followup.send(**kwargs)


@bot.tree.command(name="genkey", description="Generate license keys")
@app_commands.describe(key_type="Key type", amount="Number of keys (1-50)", note="Optional note")
@app_commands.choices(key_type=[
    app_commands.Choice(name="1 Hour", value="hourly"),
    app_commands.Choice(name="1 Day", value="daily"),
    app_commands.Choice(name="1 Week", value="weekly"),
    app_commands.Choice(name="1 Month", value="monthly"),
    app_commands.Choice(name="Lifetime", value="lifetime"),
])
async def genkey(interaction: discord.Interaction, key_type: str, amount: int = 1, note: str = ""):
    if not is_admin(interaction.user.id):
        await interaction.response.send_message(embed=discord.Embed(title="Access Denied", color=discord.Color.red()), ephemeral=True)
        return
    if amount < 1 or amount > 50:
        await interaction.response.send_message(embed=discord.Embed(title="Invalid", description="Amount must be 1-50.", color=discord.Color.red()), ephemeral=True)
        return
    await interaction.response.defer(ephemeral=True)
    keys = generate_keys(key_type, amount, note)
    label = KEY_TYPES[key_type]["label"]
    f = get_logo_file()
    embed = discord.Embed(color=DARK)
    set_thumb(embed)
    if len(keys) == 1:
        embed.title = "Key Generated"
        embed.add_field(name="Key", value=f"`{keys[0]}`", inline=False)
        embed.add_field(name="Type", value=label, inline=True)
    else:
        embed.title = f"{len(keys)} Keys Generated"
        embed.add_field(name="Type", value=label, inline=True)
        key_list = "\n".join(f"`{k}`" for k in keys)
        if len(key_list) > 1024:
            key_list = key_list[:1020] + "\n..."
        embed.add_field(name="Keys", value=key_list, inline=False)
    embed.set_footer(text=f"{APP_NAME} | Generated by {interaction.user}")
    kwargs = {"embed": embed, "ephemeral": True}
    if f:
        kwargs["file"] = f
    await interaction.followup.send(**kwargs)


@bot.tree.command(name="revoke", description="Revoke a license key")
@app_commands.describe(key="The key to revoke")
async def revoke(interaction: discord.Interaction, key: str):
    if not is_admin(interaction.user.id):
        await interaction.response.send_message(embed=discord.Embed(title="Access Denied", color=discord.Color.red()), ephemeral=True)
        return
    key = key.upper().strip()
    success = revoke_key(key)
    f = get_logo_file()
    if success:
        embed = discord.Embed(title="Key Revoked", description=f"`{key}` revoked.", color=DARK)
    else:
        embed = discord.Embed(title="Not Found", description=f"`{key}` does not exist.", color=discord.Color.red())
    set_thumb(embed)
    embed.set_footer(text=f"{APP_NAME} | Admin")
    kwargs = {"embed": embed, "ephemeral": True}
    if f:
        kwargs["file"] = f
    await interaction.response.send_message(**kwargs)


@bot.tree.command(name="keys", description="List all keys")
@app_commands.describe(show_revoked="Include revoked keys")
async def keys(interaction: discord.Interaction, show_revoked: bool = False):
    if not is_admin(interaction.user.id):
        await interaction.response.send_message(embed=discord.Embed(title="Access Denied", color=discord.Color.red()), ephemeral=True)
        return
    await interaction.response.defer(ephemeral=True)
    all_keys = list_keys(include_revoked=show_revoked)
    f = get_logo_file()
    if not all_keys:
        embed = discord.Embed(title="No Keys", description="No keys generated yet.", color=DARK)
        set_thumb(embed)
        embed.set_footer(text=f"{APP_NAME} | Admin")
        kwargs = {"embed": embed, "ephemeral": True}
        if f:
            kwargs["file"] = f
        await interaction.followup.send(**kwargs)
        return
    embed = discord.Embed(title=f"Keys ({len(all_keys)})", color=DARK)
    for k in all_keys[:25]:
        status = "active"
        if k.get("revoked"):
            status = "revoked"
        elif k.get("expires_at") and time.time() > k["expires_at"]:
            status = "expired"
        elif not k.get("redeemed"):
            status = "unused"
        hwid_str = k.get("hwid") or "N/A"
        if hwid_str and hwid_str != "N/A":
            hwid_str = hwid_str[:16] + "..."
        reg = "yes" if k.get("registered") else "no"
        user = k.get("username") or "none"
        value = f"Type: `{k.get('type_label', 'N/A')}` | Status: `{status}`\nRegistered: `{reg}` | User: `{user}`\nHWID: `{hwid_str}`"
        embed.add_field(name=k["key"], value=value, inline=False)
    if len(all_keys) > 25:
        embed.set_footer(text=f"Showing 25 of {len(all_keys)}")
    set_thumb(embed)
    embed.set_footer(text=f"{APP_NAME} | Admin")
    kwargs = {"embed": embed, "ephemeral": True}
    if f:
        kwargs["file"] = f
    await interaction.followup.send(**kwargs)


@bot.tree.command(name="checkkey", description="Check key details")
@app_commands.describe(key="The key to check")
async def checkkey(interaction: discord.Interaction, key: str):
    key = key.upper().strip()
    result = check_key(key)
    f = get_logo_file()
    if result["valid"]:
        info = result["info"]
        embed = discord.Embed(title="Key Valid", color=DARK)
        embed.add_field(name="Key", value=f"`{info['key']}`", inline=False)
        embed.add_field(name="Type", value=info.get("type_label", "N/A"), inline=True)
        embed.add_field(name="Redeemed", value=str(info.get("redeemed", False)), inline=True)
        embed.add_field(name="Registered", value=str(info.get("registered", False)), inline=True)
        embed.add_field(name="Username", value=info.get("username") or "none", inline=True)
        hwid = info.get("hwid")
        if hwid:
            embed.add_field(name="HWID", value=f"`{hwid[:16]}...`", inline=False)
        if info.get("expires_at"):
            remaining = info["expires_at"] - time.time()
            if remaining > 0:
                days, rem = divmod(int(remaining), 86400)
                hours, rem = divmod(rem, 3600)
                mins, _ = divmod(rem, 60)
                time_left = f"{days}d {hours}h {mins}m" if days else f"{hours}h {mins}m"
                embed.add_field(name="Expires In", value=time_left, inline=True)
            else:
                embed.add_field(name="Status", value="Expired", inline=True)
        if info.get("note"):
            embed.add_field(name="Note", value=info["note"], inline=False)
    else:
        embed = discord.Embed(title="Key Invalid", description=result["reason"], color=discord.Color.red())
    set_thumb(embed)
    embed.set_footer(text=f"{APP_NAME} | Key System")
    kwargs = {"embed": embed, "ephemeral": True}
    if f:
        kwargs["file"] = f
    await interaction.response.send_message(**kwargs)


@bot.tree.command(name="generate", description="Generate script for a key")
@app_commands.describe(key="Your license key")
async def generate(interaction: discord.Interaction, key: str):
    await interaction.response.defer(ephemeral=True)
    key = key.upper().strip()
    result = check_key(key)
    f = get_logo_file()
    if not result["valid"]:
        embed = discord.Embed(title="Invalid Key", description=result["reason"], color=discord.Color.red())
        set_thumb(embed)
        kwargs = {"embed": embed, "ephemeral": True}
        if f:
            kwargs["file"] = f
        await interaction.followup.send(**kwargs)
        return
    config_header = build_config_header()
    loadstring_line = 'loadstring(game:HttpGet("http://localhost:5000/api/get?key=' + key + '"))()'
    full_script = config_header + "\n" + loadstring_line
    embed = discord.Embed(title="Script Generated", description="Paste into your executor.", color=DARK)
    embed.add_field(name="Key", value=f"`{key}`", inline=True)
    embed.add_field(name="Type", value=result["info"].get("type_label", "N/A"), inline=True)
    set_thumb(embed)
    embed.set_footer(text=f"{APP_NAME} | Key System")
    kwargs = {"embed": embed, "ephemeral": True}
    if f:
        kwargs["file"] = f
    await interaction.followup.send(**kwargs)
    await interaction.followup.send(f"```\n{full_script}\n```", ephemeral=True)


@bot.tree.command(name="redeem", description="Redeem a license key")
@app_commands.describe(key="Your license key")
async def redeem(interaction: discord.Interaction, key: str):
    await interaction.response.defer(ephemeral=True)
    key = key.upper().strip()
    hwid = get_hwid()
    result = redeem_key(key, hwid, str(interaction.user))
    f = get_logo_file()
    if result["success"]:
        info = result["info"]
        embed = discord.Embed(title="Key Redeemed", description="Bound to your HWID.", color=DARK)
        embed.add_field(name="Key", value=f"`{key}`", inline=True)
        embed.add_field(name="Type", value=info.get("type_label", "N/A"), inline=True)
    else:
        embed = discord.Embed(title="Failed", description=result["reason"], color=discord.Color.red())
    set_thumb(embed)
    embed.set_footer(text=f"{APP_NAME} | Key System")
    kwargs = {"embed": embed, "ephemeral": True}
    if f:
        kwargs["file"] = f
    await interaction.followup.send(**kwargs)


@bot.tree.command(name="emojis", description="List all server emojis")
async def emojis(interaction: discord.Interaction):
    if not interaction.guild:
        await interaction.response.send_message("Server only.", ephemeral=True)
        return
    guild_emojis = interaction.guild.emojis
    if not guild_emojis:
        await interaction.response.send_message("No custom emojis.", ephemeral=True)
        return
    lines = [f"{e} - `{e.name}` (id: `{e.id}`)" for e in guild_emojis[:50]]
    embed = discord.Embed(title=f"Server Emojis ({len(guild_emojis)})", description="\n".join(lines), color=DARK)
    embed.set_footer(text=f"{APP_NAME} | Admin")
    await interaction.response.send_message(embed=embed, ephemeral=True)


@bot.tree.command(name="info", description="Bot information")
async def info(interaction: discord.Interaction):
    f = get_logo_file()
    embed = discord.Embed(title=APP_NAME, description="Da Hood script configuration tool.", color=DARK)
    embed.add_field(name="Version", value=VERSION, inline=True)
    embed.add_field(name="Python", value=platform.python_version(), inline=True)
    embed.add_field(name="Discord.py", value=discord.__version__, inline=True)
    set_thumb(embed)
    embed.set_footer(text=f"{APP_NAME} | Info")
    kwargs = {"embed": embed}
    if f:
        kwargs["file"] = f
    await interaction.response.send_message(**kwargs)


@bot.tree.command(name="status", description="Bot status")
async def status(interaction: discord.Interaction):
    uptime_secs = int(time.time() - start_time)
    hours, remainder = divmod(uptime_secs, 3600)
    minutes, seconds = divmod(remainder, 60)
    stats = get_stats()
    f = get_logo_file()
    embed = discord.Embed(title="Bot Status", color=DARK)
    embed.add_field(name="Uptime", value=f"{hours}h {minutes}m {seconds}s", inline=True)
    embed.add_field(name="Latency", value=f"{int(bot.latency * 1000)}ms", inline=True)
    embed.add_field(name="Guilds", value=str(len(bot.guilds)), inline=True)
    embed.add_field(name="Total Keys", value=str(stats["total"]), inline=True)
    embed.add_field(name="Active", value=str(stats["active"]), inline=True)
    embed.add_field(name="Registered", value=str(stats["registered"]), inline=True)
    set_thumb(embed)
    embed.set_footer(text=f"{APP_NAME} | Status")
    kwargs = {"embed": embed}
    if f:
        kwargs["file"] = f
    await interaction.response.send_message(**kwargs)


@bot.tree.command(name="help", description="Show all commands")
async def help_slash(interaction: discord.Interaction):
    f = get_logo_file()
    embed = discord.Embed(
        title=f"{APP_NAME} - Commands",
        color=DARK,
        description=(
            "**User Commands**\n"
            "`/panel` - Control panel\n"
            "`/register` - Register your key\n"
            "`/login` - Log in\n"
            "`/generate` - Get your script\n"
            "`/redeem` - Redeem a key\n"
            "`/help` - This message\n\n"
            "**Admin Commands**\n"
            "`/admin` - Admin panel\n"
            "`/genkey` - Generate keys\n"
            "`/revoke` - Revoke a key\n"
            "`/keys` - List all keys\n"
            "`/checkkey` - Check key details\n"
            "`/emojis` - List server emojis\n"
            "`/status` - Bot status\n"
            "`/info` - Bot info"
        )
    )
    set_thumb(embed)
    embed.set_footer(text=f"{APP_NAME} | Help")
    kwargs = {"embed": embed, "ephemeral": True}
    if f:
        kwargs["file"] = f
    await interaction.response.send_message(**kwargs)


# ── Run ──


def run_bot():
    if not BOT_TOKEN:
        print("ERROR: Set VENDING_BOT_TOKEN environment variable")
        sys.exit(1)
    bot.run(BOT_TOKEN)


if __name__ == "__main__":
    run_bot()
