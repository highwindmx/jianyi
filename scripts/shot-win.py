# 截取指定标题的原生窗口。
# PowerShell 那条路被安全策略挡了（Add-Type 会动态编译 .NET 代码），
# 所以改用 ctypes 直接调 user32 —— 顺带躲开 PS 5.1 按 ANSI 读脚本的中文乱码坑。
import ctypes
import ctypes.wintypes as wt
import sys
import time

from PIL import ImageGrab

TITLE_KEY = "文件流程工作台"
OUT = sys.argv[1] if len(sys.argv) > 1 else "shots/win.png"

u = ctypes.windll.user32
u.SetProcessDPIAware()
u.EnumWindows.argtypes = [ctypes.WINFUNCTYPE(ctypes.c_bool, wt.HWND, wt.LPARAM), wt.LPARAM]
u.GetWindowTextLengthW.argtypes = [wt.HWND]
u.GetWindowTextW.argtypes = [wt.HWND, ctypes.c_wchar_p, ctypes.c_int]

found = []
CB = ctypes.WINFUNCTYPE(ctypes.c_bool, wt.HWND, wt.LPARAM)


@CB
def cb(hwnd, _lparam):
    n = u.GetWindowTextLengthW(hwnd)
    if n:
        buf = ctypes.create_unicode_buffer(n + 1)
        u.GetWindowTextW(hwnd, buf, n + 1)
        if TITLE_KEY in buf.value:
            found.append((hwnd, buf.value))
    return True


u.EnumWindows(cb, 0)
if not found:
    print("NOT_FOUND")
    sys.exit(1)

hwnd, title = found[0]
u.ShowWindow(hwnd, 9)  # SW_RESTORE
u.SetForegroundWindow(hwnd)
time.sleep(1.5)

r = wt.RECT()
u.GetWindowRect(hwnd, ctypes.byref(r))
w, h = r.right - r.left, r.bottom - r.top
print(f"FOUND hwnd={hwnd} rect={w}x{h} title={title}")

ImageGrab.grab(bbox=(r.left, r.top, r.right, r.bottom), all_screens=True).save(OUT)
print("SAVED", OUT)
