# 脚本目录

- make_demo.py：生成项目自身的示例简谱 PNG，使用 Pillow。
- build.ps1：安装构建依赖、运行测试，然后生成 dist/JianpuUke.exe。
- package.py：将 exe、使用说明、MIT 许可与 third_party/ 许可整理成 Windows 便携 ZIP。

在项目根目录执行；构建产物被 .gitignore 排除，分发时另行压缩，不将 exe 塞入源码提交。
