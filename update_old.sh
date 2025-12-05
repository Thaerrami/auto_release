# #!/bin/bash

# # Prompt user for a list of tags without the patch
read -p "Enter a list of tags (e.g., 2.5 3.1): " -a tags

# Prompt user for a list of revisions to be cherry-picked
read -p "Enter a list of revisions to be cherry-picked (e.g., abc123 def456): " -a revisions

# Checkout to the develop branch
git checkout develop

# Fetch the latest tags from the remote repository
git fetch --tags

# Check if the current repository is ui-article
repo_name=$(basename "$(git rev-parse --show-toplevel)")
if [ "$repo_name" = "ui-article" ]; then
    echo yes
else
    echo no
fi

repo_name=$(basename "$(git rev-parse --show-toplevel)")
if [ "$repo_name" != "ui-article" ]; then
    echo "This script must be run in the 'ui-article' repository. Exiting..."
    exit 1
fi


# Loop over each tag provided by the user
for tag in "${tags[@]}"; do
    echo "Processing tag: $tag"

    # Get the latest patch version for the current tag from the remote repository
    latest_patch=$(git tag -l "v${tag}.*" | sort -V | tail -n 1)
    if [ -z "$latest_patch" ]; then
        echo "No existing patch versions found for $tag. Skipping..."
        continue
    fi
    echo "Latest patch version for $tag: $latest_patch"
    
    # Checkout to the latest patch version
    git checkout "$latest_patch"
    
    # Increment the patch version
    IFS='.' read -r major minor patch <<< "${latest_patch}"
    new_patch=$((patch + 1))
    new_tag="${major}.${minor}.${new_patch}"
    echo "New tag to be created: $new_tag"
    
    # Cherry-pick the provided revisions
    for rev in "${revisions[@]}"; do
        echo "Cherry-picking revision: $rev"
        if ! git cherry-pick "$rev"; then
            echo "Conflict detected while cherry-picking $rev."
            echo "Please resolve the conflict. Once resolved, press Enter to continue..."
            while true; do
            read -p "Press Enter to continue..." -r
            if git cherry-pick --continue; then
                echo "Cherry-pick completed successfully."
                break
            elif git log --oneline | grep -q "$rev"; then
                echo "Revision $rev already committed. Skipping..."
                break
            else
                echo "Conflict resolution failed or revision already committed. Please resolve manually and press Enter to retry."
            fi
            done
        fi
    done

    git tag "$new_tag"
    echo "Created new tag: $new_tag"
    
    # Push the new tag to the remote repository
    git push origin "$new_tag"
    echo "Pushed new tag: $new_tag"
    git tag -d "$new_tag"
    echo "Deleted local tag: $new_tag"

    # Checkout back to develop branch before processing the next tag
    git checkout develop
done

echo "All tags processed successfully for core repo next step update themes."

# Check if tags array is not empty and no conflicts occurred
if [ ${#tags[@]} -ne 0 ]; then
    # Run the UpgradeThemes.sh script
    "$(dirname "$0")/UpgradeThemes2.sh" "current_application" "${tags[@]}"
    # echo "UpgradeThemes.sh executed successfully."
    echo "Upgrade themes executed successfully."
else
    echo "No tags were processed or conflicts occurred. UpgradeThemes.sh will not be executed."
fi