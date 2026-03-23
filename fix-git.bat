@echo off
cd /d C:\sellcontrol
git rm -r --cached node_modules > nul 2>&1
git add .
git commit -m "fix: remove node_modules, adiciona gitignore"
git push origin main
