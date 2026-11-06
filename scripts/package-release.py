#!/usr/bin/env python3
"""Package reviewed source, optional macOS DMG, and optional example film.

Only named source trees and root files are eligible. Local environments, credentials,
build caches, browser test output, and deployment account links are excluded.
"""
import argparse
from pathlib import Path
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('output', type=Path)
parser.add_argument('--dmg', type=Path)
parser.add_argument('--example', type=Path)
parser.add_argument('--example-project', type=Path)
parser.add_argument('--example-video', type=Path)
parser.add_argument('--preview', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
directories = {'.github', 'api', 'companion', 'crates', 'docs', 'e2e', 'integrations', 'public', 'scripts', 'server', 'src', 'src-tauri', 'tests', 'tools'}
files = {'README.md', 'START-HERE.md', '.env.example', '.gitignore', '.vercelignore', 'index.html', 'package.json', 'package-lock.json', 'playwright.config.ts', 'tsconfig.json', 'vercel.json', 'vite.config.ts', 'vitest.config.ts'}
excluded = {'target', 'node_modules', 'gen', '.vercel', '.git', '__pycache__', '.DS_Store', 'test-results', 'playwright-report'}
prefix = 'Short Films AI Harness/'
args.output.parent.mkdir(parents=True, exist_ok=True)
count = 0
with zipfile.ZipFile(args.output, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for path in sorted(root.rglob('*')):
        relative = path.relative_to(root)
        if not path.is_file() or path.is_symlink() or any(part in excluded for part in relative.parts):
            continue
        if relative.parts[0] not in directories and str(relative) not in files:
            continue
        if path.name.startswith('.env') and path.name != '.env.example':
            continue
        if path.suffix in {'.log', '.pem', '.key', '.p12', '.p8', '.tsbuildinfo', '.pyc'} or path.name in {'auth.json', 'credentials.json', 'settings.local.json'}:
            continue
        archive.write(path, prefix + str(relative))
        count += 1
    if args.dmg:
        archive.write(args.dmg, prefix + 'macOS/Frame-macOS-Apple-Silicon.dmg')
    if args.example:
        archive.write(args.example, prefix + 'example-film.html')
    if args.example_project:
        archive.write(args.example_project, prefix + 'example-film.frame.json')
    if args.example_video:
        archive.write(args.example_video, prefix + 'example-film.mp4')
    if args.preview:
        archive.write(args.preview, prefix + 'studio-preview.png')
print(f'Packaged {count} source files: {args.output.name} ({args.output.stat().st_size:,} bytes)')
