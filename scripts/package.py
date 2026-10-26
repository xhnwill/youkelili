"""Assemble a portable Windows ZIP, preserving attribution and user instructions."""
import argparse
from pathlib import Path
import shutil
import zipfile
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from uke import VERSION, BUILD_DATE


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--exe", type=Path, default=ROOT/"dist"/"JianpuUke.exe")
    parser.add_argument("--output", type=Path, default=ROOT/"dist")
    args = parser.parse_args()
    if not args.exe.is_file():
        raise SystemExit("Build JianpuUke.exe first.")
    folder = args.output / ("JianpuUke-Windows-v" + VERSION)
    folder.mkdir(parents=True, exist_ok=True)
    shutil.copy2(args.exe, folder/"JianpuUke.exe")
    shutil.copy2(ROOT/"LICENSE", folder/"LICENSE")
    shutil.copytree(ROOT/"third_party", folder/"third_party", dirs_exist_ok=True)
    (folder/"README.txt").write_text(
        "简谱小尤 JianpuUke v%s · %s\n\n"
        "1. 双击 JianpuUke.exe，系统浏览器将打开本机工作台，无需安装 Python。\n"
        "2. 点击“识谱接口”，填写支持图片的模型、完整 Chat Completions 地址与 API Key。\n"
        "3. 上传简谱图片，可拖动框选识别区域，然后点击“AI 识别简谱”。\n"
        "4. 对照原图校对音点、节奏、调号，选择 High G / Low G，生成四线谱。\n"
        "5. 试听并标记已校对，即可导出 SVG、MIDI、MusicXML 或打印为 PDF。\n"
        "6. 使用完点击右上角“退出”。单独关闭网页不会退出本机服务。\n\n"
        "软件仅转换单旋律，不自动编配伴奏。AI 识谱需要自己的接口和额度，可能识错。\n"
        "API Key 仅在当前页面内存中，不写工程。工程保存包含图片与音符，请自行妥善保管。\n"
        "“试试示例”为预置图片与音符，不调用 AI。\n\n"
        "源码、完整说明：https://github.com/xhnwill/youkelili\n"
        "MIT 许可见 LICENSE，第三方许可见 third_party/。\n" % (VERSION, BUILD_DATE), encoding="utf-8")
    archive = args.output / (folder.name+".zip")
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
        for file in sorted(folder.rglob("*")):
            if file.is_file():
                z.write(file, file.relative_to(args.output))
    print(archive)


if __name__ == "__main__":
    main()
