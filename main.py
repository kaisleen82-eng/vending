import sys
import os
import argparse


def main():
    parser = argparse.ArgumentParser(description="VENDING - Da Hood Script Tool")
    parser.add_argument("--gui", action="store_true", help="Launch the GUI application")
    parser.add_argument("--bot", action="store_true", help="Launch the Discord bot")
    parser.add_argument("--hwid", action="store_true", help="Show your HWID")
    args = parser.parse_args()

    if args.hwid:
        from hwid import get_hwid, format_hwid_display
        hwid = get_hwid()
        print(f"Your HWID: {format_hwid_display(hwid)}")
        print(f"Raw: {hwid}")
        return

    if args.bot:
        from bot import run_bot
        run_bot()
        return

    if args.gui:
        from PyQt5.QtWidgets import QApplication
        from gui_app import VendingGUI
        app = QApplication(sys.argv)
        app.setApplicationName("VENDING")
        window = VendingGUI()
        window.show()
        sys.exit(app.exec_())
        return

    print(f"VENDING - Da Hood Script Tool")
    print(f"")
    print(f"Usage:")
    print(f"  python main.py --gui    Launch the desktop GUI")
    print(f"  python main.py --bot    Launch the Discord bot")
    print(f"  python main.py --hwid   Show your HWID")
    print(f"")
    print(f"Before running:")
    print(f"  1. Install dependencies: pip install -r requirements.txt")
    print(f"  2. For the bot, set: set VENDING_BOT_TOKEN=your_token")
    print(f"  3. Place luabody.txt in the same folder as main.py")


if __name__ == "__main__":
    main()
