#!/bin/bash

# Get the head application from the terminal
head_application="$1"
shift

# Get the list of tags from the command line arguments
tags=("$@")

# Set the list of applications based on the head application
if [[ "$head_application" == "ui-core" ]]; then
    # applications=("ui-theme-photo" "ui-theme-classic")
    applications=("ui-theme-photo")
elif [[ "$head_application" == "ui-base" ]]; then
    applications=("ui-core" "ui-theme-eureka" "ui-theme-classic" "ui-theme-photo")
else
    echo "Invalid head application. Please enter either 'ui-core' or 'ui-base'."
    exit 1
fi


# Check if there are any changes to be stashed
if ! git diff-index --quiet HEAD --; then
    # Stash any local changes to avoid conflicts
    git stash
    # Notify the developer about stashed changes
    echo "Uncommitted changes have been stashed. You can apply them later using 'git stash pop'."
fi

# Checkout the develop branch
git checkout develop

git fetch --tags --all

# ////////////////////////////////////
# Loop through each application
for app in "${applications[@]}"; do

    # Navigate to the application directory
    cd "../${app}" || continue
    echo "Navigated to directory: ../${app}"
    # Check if the application has ui-core or ui-base in its dependencies and get the existing one
    parent_dependency=$(jq -r 'if .dependencies["ui-core"] then "ui-core" elif .dependencies["ui-base"] then "ui-base" else empty end' package.json)
    if [[ -z "$parent_dependency" ]]; then
        echo "Neither ui-core nor ui-base found in dependencies for ${app}. Skipping..."
        cd - || exit
        continue
    fi

    # Prompt the developer to enter a list of revisions to be applied as cherry-pick
    echo "Please enter the list of revisions to be applied as cherry-pick (space-separated): for ${app}"
    read -r -a revisions
    

    echo "Existing dependency for ${app}: $existing_dependency"
    # Loop through each provided tag
    for tag in "${tags[@]}"; do
        echo "Processing tag: $tag"
        
        # Get the latest version of the dependency
        latest_theme_dependency_tag=$(git ls-remote --tags git@github.com:atypon/${app}.git | awk -v tag_prefix="$tag" '$2 ~ tag_prefix {sub("refs/tags/", "", $2); print $2}' | sort -V | tail -n 1)
        echo "Latest theme for ${app} is: $latest_theme_dependency_tag"
        
        # If no tags exist, set the latest_dependency_tag to the current tag
        if [[ -z "$latest_theme_dependency_tag" ]]; then
            latest_theme_dependency_tag="$latest_tag"
        fi

        # checkout to the latest tag for the theme
        git checkout $latest_theme_dependency_tag
        echo "Checked out to tag: $latest_theme_dependency_tag"

        # Apply each revision using cherry-pick for each tag
        for rev in "${revisions[@]}"; do
            echo "Cherry-picking revision: $rev"
            git cherry-pick "$rev"
            if [[ $? -ne 0 ]]; then
                echo "Conflict detected during cherry-pick of revision $rev. Please resolve the conflict and press Enter to continue."
                read -r
                git cherry-pick --continue
            fi
        done

        # Open the package.json file and get the ui-core or ui-base version
        PACKAGE_JSON="package.json"
        current_version=$(jq -r '.dependencies["ui-core"] // .dependencies["ui-base"]' $PACKAGE_JSON)
        echo "Current version in package.json: $current_version"

        # Update the package.json with the latest tag
        echo "Dependency to update: $parent_dependency"
        
        # Get the latest version of the dependency
        latest_dependency_tag=$(git ls-remote --tags git@github.com:atypon/${parent_dependency}.git | awk -v tag_prefix="$tag" '$2 ~ tag_prefix {sub("refs/tags/", "", $2); print $2}' | sort -V | tail -n 1)
        echo "Latest tag for ${dependency}: $latest_dependency_tag"


        # If no tags exist, set the latest_dependency_tag to the current tag
        if [[ -z "$latest_dependency_tag" ]]; then
            latest_dependency_tag="$latest_tag"
        fi
        echo "Final latest tag for ${dependency}: $latest_dependency_tag"

        jq --arg dependency "$parent_dependency" --arg version "git+ssh://git@github.com/atypon/${parent_dependency}.git#${latest_dependency_tag}" '.dependencies[$dependency] = $version' $PACKAGE_JSON > tmp.$$.json && mv tmp.$$.json $PACKAGE_JSON
        echo "Updated package.json with $dependency version $latest_dependency_tag"

        # # Commit the updated package.json
        git add $PACKAGE_JSON
        git commit -m "Update ${dependency} to version $latest_dependency_tag"
        echo "Committed changes to package.json"

        # # Create a new tag with the latest patch incremented by 1
        IFS='.' read -r -a TAG_PARTS <<< "$latest_theme_dependency_tag"
        ((TAG_PARTS[2]++))
        NEW_TAG="v${TAG_PARTS[0]}.${TAG_PARTS[1]}.${TAG_PARTS[2]}"
        echo "New tag: $NEW_TAG"

        # # Push the changes and the new tag
        git tag $NEW_TAG
        # echo "Created new tag: $NEW_TAG"
        git push origin --tags
        # # git push origin $NEW_TAG 

        # # Output the latest commit
        LATEST_COMMIT=$(git rev-parse HEAD)
        echo "Latest commit: $LATEST_COMMIT"
    done

        # Navigate back to the root directory
        cd - || exit
        done

