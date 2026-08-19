from urllib.request import urlopen

SOURCE = "https://amuletmaiden.github.io/katherines-stacks/katherines_stacks.py"


def show_error(message):
    try:
        import tkinter
        from tkinter import messagebox
        root = tkinter.Tk()
        root.withdraw()
        messagebox.showerror("Katherine's Stacks", message)
        root.destroy()
    except Exception:
        pass


try:
    source = urlopen(SOURCE, timeout=30).read().decode("utf-8")
    scope = {"__name__": "katherines_stacks_core"}
    exec(compile(source, SOURCE, "exec"), scope)
    scope["main"](["serve"])
except Exception as exc:
    show_error(f"Katherine's Stacks could not start.\n\n{exc}")
