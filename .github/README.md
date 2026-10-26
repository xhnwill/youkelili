# GitHub 自动化

workflows/ci.yml 在 push 和 PR 时执行 Python 回归。手动运行 workflow_dispatch 才构建 Windows exe，并上传构建 artifact，不自动发布 GitHub Release。
