#!/bin/bash

# Prompt the user to enter a list of products
echo "Enter a list of themes separated by spaces (e.g., photo classic eureka base core):"
read -a applications


# Prompt the user to select a product
read -p "Enter product name: " product

# Get the list of tags from the command line arguments
tags=("$@")

git checkout develop

git fetch --tags --all


# Prompt the user to choose whether to apply commits to all tags or specific tags
# echo "Do you want to apply commits to all tags or specific tags? (all/specific)"
# read apply_to
# 
# # If the user chooses specific tags, use the tags provided as parameters
# if [[ "$apply_to" == "specific" ]]; then
#     specific_tags=("$@")
# fi
# 
# # Prompt the user to enter the list of commits to be applied
# echo "Enter the list of commits to be applied (or press Enter to skip):"
# read -a commits
# 
# # Loop through each application
# for app in "${applications[@]}"; do
#     if [[ "$app" == "base" || "$app" == "core" ]]; then
#         prefix="ui-"
#     else
#         prefix="ui-theme-"
#     fi
# 
#     # Navigate to the application directory
#     cd "../${prefix}${app}" || continue
# 
#     # Loop through each provided tag
#     for tag in "${tags[@]}"; do
#         # Get the latest version of the dependency
#         latest_theme_dependency_tag=$(git ls-remote --tags git@github.com:atypon/${prefix}${app}.git | awk -v tag_prefix="$tag" '$2 ~ tag_prefix {sub("refs/tags/", "", $2); print $2}' | sort -V | tail -n 1)
#         echo "Latest theme for ${app} is: $latest_theme_dependency_tag"
#         
#         # If no tags exist, set the latest_dependency_tag to the current tag
#         if [[ -z "$latest_theme_dependency_tag" ]]; then
#             latest_theme_dependency_tag="$latest_tag"
#         fi
# 
#         git checkout $latest_theme_dependency_tag
# 
#         # Apply commits if any
#         for commit in "${commits[@]}"; do
#             if [[ "$apply_to" == "all" ]]; then
#                 # Check if the tag already has the latest dependency and commit changes
#                 if git show $latest_theme_dependency_tag:$PACKAGE_JSON | jq -e --arg dependency "$dependency" --arg version "git+ssh://git@github.com/atypon/${dependency}.git#${latest_dependency_tag}" '.dependencies[$dependency] == $version' > /dev/null && git log $latest_theme_dependency_tag | grep -q $commit; then
#                     echo "Tag $latest_theme_dependency_tag already has the latest dependency and commit $commit. Skipping."
#                     continue
#                 fi
# 
#                 git cherry-pick $commit || {
#                     echo "Conflict detected while cherry-picking commit $commit in ${prefix}${app}. Aborting."
#                     git cherry-pick --abort
#                     continue 2
#                 }
#             else
#                 for specific_tag in "${specific_tags[@]}"; do
#                     if [[ "$specific_tag" == "${prefix}${app}" ]]; then
#                         # Check if the tag already has the latest dependency and commit changes
#                         if git show $latest_theme_dependency_tag:$PACKAGE_JSON | jq -e --arg dependency "$dependency" --arg version "git+ssh://git@github.com/atypon/${dependency}.git#${latest_dependency_tag}" '.dependencies[$dependency] == $version' > /dev/null && git log $latest_theme_dependency_tag | grep -q $commit; then
#                             echo "Tag $latest_theme_dependency_tag already has the latest dependency and commit $commit. Skipping."
#                             break
#                         fi
# 
#                         git cherry-pick $commit || {
#                             echo "Conflict detected while cherry-picking commit $commit in ${prefix}${app}. Aborting."
#                             git cherry-pick --abort
#                             continue 2
#                         }
#                         break
#                     fi
#                 done
#             fi
#         done
# 
#         # Open the package.json file and get the ui-core or ui-base version
#         PACKAGE_JSON="package.json"
#         current_version=$(jq -r '.dependencies["ui-core"] // .dependencies["ui-base"]' $PACKAGE_JSON)
# 
#         # Update the package.json with the latest tag
#         if [[ "$app" == "base" || "$app" == "core" ]]; then
#             dependency="ui-${app}"
#         else
#             dependency="ui-core"
#         fi
#         
#         # Get the latest version of the dependency
#         latest_dependency_tag=$(git ls-remote --tags git@github.com:atypon/${dependency}.git | awk -v tag_prefix="$tag" '$2 ~ tag_prefix {sub("refs/tags/", "", $2); print $2}' | sort -V | tail -n 1)
#         echo "Latest tag for ${dependency}: $latest_dependency_tag"
#         
#         # If no tags exist, set the latest_dependency_tag to the current tag
#         if [[ -z "$latest_dependency_tag" ]]; then
#             latest_dependency_tag="$latest_tag"
#         fi
# 
#         jq --arg dependency "$dependency" --arg version "git+ssh://git@github.com/atypon/${dependency}.git#${latest_dependency_tag}" '.dependencies[$dependency] = $version' $PACKAGE_JSON > tmp.$$.json && mv tmp.$$.json $PACKAGE_JSON
# 
#         # Commit the updated package.json
#         git add $PACKAGE_JSON
#         git commit -m "Update ${dependency} to version $latest_dependency_tag"
# 
#         # Create a new tag with the latest patch incremented by 1
#         IFS='.' read -r -a TAG_PARTS <<< "$latest_theme_dependency_tag"
#         ((TAG_PARTS[2]++))
#         NEW_TAG="test${TAG_PARTS[0]}.${TAG_PARTS[1]}.${TAG_PARTS[2]}"
#         echo "New tag: $NEW_TAG"
# 
#         # Push the changes and the new tag
#         git tag $NEW_TAG
#         # git push origin --tags
#         # git push origin $NEW_TAG 
# 
#         # Output the latest commit
#         LATEST_COMMIT=$(git rev-parse HEAD)
#         echo "Latest commit: $LATEST_COMMIT"
#     done
# 
#     # Navigate back to the root directory
    # cd - || exit
# done



# ////////////////////////////////////
# Loop through each application
for app in "${applications[@]}"; do
    if [[ "$app" == "base" || "$app" == "core" ]]; then
        prefix="ui-"
    else
        prefix="ui-theme-"
    fi

    # Navigate to the application directory
    cd "../${prefix}${app}" || continue
    echo "Navigated to directory: ../${prefix}${app}"
    
    # Loop through each provided tag
    for tag in "${tags[@]}"; do
        echo "Processing tag: $tag"
        
        # Get the latest version of the dependency
        latest_theme_dependency_tag=$(git ls-remote --tags git@github.com:atypon/${prefix}${app}.git | awk -v tag_prefix="$tag" '$2 ~ tag_prefix {sub("refs/tags/", "", $2); print $2}' | sort -V | tail -n 1)
        echo "Latest theme for ${app} is: $latest_theme_dependency_tag"
        
        # If no tags exist, set the latest_dependency_tag to the current tag
        if [[ -z "$latest_theme_dependency_tag" ]]; then
            latest_theme_dependency_tag="$latest_tag"
        fi

        git checkout $latest_theme_dependency_tag
        echo "Checked out to tag: $latest_theme_dependency_tag"

        # Open the package.json file and get the ui-core or ui-base version
        PACKAGE_JSON="package.json"
        current_version=$(jq -r '.dependencies["ui-core"] // .dependencies["ui-base"]' $PACKAGE_JSON)
        echo "Current version in package.json: $current_version"

        # Update the package.json with the latest tag
        if [[ "$app" == "base" ]]; then
            dependency="ui-base"
        else
            dependency="ui-core"
        fi
        echo "Dependency to update: $dependency"
        
        # Get the latest version of the dependency
        latest_dependency_tag=$(git ls-remote --tags git@github.com:atypon/${dependency}.git | awk -v tag_prefix="$tag" '$2 ~ tag_prefix {sub("refs/tags/", "", $2); print $2}' | sort -V | tail -n 1)
        echo "Latest tag for ${dependency}: $latest_dependency_tag"
        
        # If no tags exist, set the latest_dependency_tag to the current tag
        if [[ -z "$latest_dependency_tag" ]]; then
            latest_dependency_tag="$latest_tag"
        fi
        echo "Final latest tag for ${dependency}: $latest_dependency_tag"

        jq --arg dependency "$dependency" --arg version "git+ssh://git@github.com/atypon/${dependency}.git#${latest_dependency_tag}" '.dependencies[$dependency] = $version' $PACKAGE_JSON > tmp.$$.json && mv tmp.$$.json $PACKAGE_JSON
        echo "Updated package.json with $dependency version $latest_dependency_tag"

        # Commit the updated package.json
        git add $PACKAGE_JSON
        git commit -m "Update ${dependency} to version $latest_dependency_tag"
        echo "Committed changes to package.json"

        # Create a new tag with the latest patch incremented by 1
        IFS='.' read -r -a TAG_PARTS <<< "$latest_theme_dependency_tag"
        ((TAG_PARTS[2]++))
        NEW_TAG="test${TAG_PARTS[0]}.${TAG_PARTS[1]}.${TAG_PARTS[2]}"
        echo "New tag: $NEW_TAG"

        # Push the changes and the new tag
        # git tag $NEW_TAG
        echo "Created new tag: $NEW_TAG"
        # git push origin --tags
        # git push origin $NEW_TAG 

        # Output the latest commit
        LATEST_COMMIT=$(git rev-parse HEAD)
        echo "Latest commit: $LATEST_COMMIT"
    done

        # Navigate back to the root directory
        cd - || exit
        done




# //////////////////////////////////



# # Navigate to the root directory containing the repositories
# cd ../
# pwd

# # Checkout the latest patch for the selected tag
# git checkout "$tag"

# # Open the package.json file and get the ui-core or ui-base version
# PACKAGE_JSON="package.json"
# current_version=$(jq -r '.dependencies["ui-core"] // .dependencies["ui-base"]' $PACKAGE_JSON)

# # Get the latest version of the dependency
# latest_version=$(npm show ui-core version)

# # Update the package.json with the latest version
# jq --arg version "$latest_version" '.dependencies["ui-core"] = $version' $PACKAGE_JSON > tmp.$$.json && mv tmp.$$.json $PACKAGE_JSON

# # Commit the updated package.json
# git add $PACKAGE_JSON
# # git commit -m "Update ui-core to version $latest_version"

# # Create a new tag with the latest patch incremented by 1
# IFS='.' read -r -a TAG_PARTS <<< "$tag"
# ((TAG_PARTS[2]++))
# NEW_TAG="${TAG_PARTS[0]}.${TAG_PARTS[1]}.${TAG_PARTS[2]}"

# # Push the changes and the new tag
# # git tag $NEW_TAG
# # git push origin main
# # git push origin $NEW_TAG

# # Output the latest commit
# LATEST_COMMIT=$(git rev-parse HEAD)
# echo "Latest commit: $LATEST_COMMIT"
