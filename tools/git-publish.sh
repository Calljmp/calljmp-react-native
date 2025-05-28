#!/bin/sh

set -e

VERSION=$(node -e "console.log(require('./package.json').version)")

git checkout main

if ! git diff-index --quiet HEAD --; then
  git add .
  git commit -S -m "v${VERSION}"
  echo "Committed changes for v${VERSION}"
else
  echo "No changes to commit"
fi

git pull origin main --rebase -X theirs
git tag --force -s -a "v${VERSION}" -m "v${VERSION}"
git push origin main --force --tags

echo "Published v${VERSION}"
