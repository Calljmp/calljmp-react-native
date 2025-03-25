#!/bin/sh

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <version>"
  exit 1
fi

VERSION=$1

rm -rf .git

git init

git remote add origin git@github.com:Calljmp/calljmp-react-native.git
git fetch origin

git checkout -b main

git add .
git commit -S -m "v${VERSION}"

git pull origin main --rebase -X theirs

git tag --force -s -a "v${VERSION}" -m "v${VERSION}"

git push origin main --force --tags

rm -rf .git

echo "Published v${VERSION}"
