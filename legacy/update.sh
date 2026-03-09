#!/bin/bash

# Exit script if any command fails
set -e

# Check if the required arguments are passed
if [ "$#" -ne 3 ]; then
    echo "Usage: $0 <old-tag> <cherry-pick-commit> <new-tag>"
    exit 1
fi

# Assign arguments to variables
OLD_TAG=$1
CHERRY_PICK_COMMIT=$2
NEW_TAG=$3

git checkout develop
git pull

# Fetch the latest changes and tags
echo "Fetching latest changes..."
git fetch && git pull
git fetch --tags --all

# Checkout the old tag
echo "Checking out old tag: $OLD_TAG"
git checkout $OLD_TAG

# Cherry-pick the specified commit
echo "Cherry-picking commit: $CHERRY_PICK_COMMIT"
git cherry-pick $CHERRY_PICK_COMMIT

# Push the changes with a new tag
echo "Creating a new tag: $NEW_TAG"
git tag $NEW_TAG

git diff $OLD_TAG $NEW_TAG

echo "Pushing changes and tags to the remote... \n
run git push origin --tags"
# git push origin --tags

echo "Process completed successfully!"
