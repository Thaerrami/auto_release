revision="$1"
tags=("${@:2}")

git pull
git fetch --tags

# get the latest tag
latest_tag=$(git tag -l | sort -V | tail -n 1)
echo "Latest tag: $latest_tag"
echo "Processing revision: $revision"


read -p "Enter a the ui-artile tags (e.g., 2.5 3.1 6.1): " -a article_tags

for article_tag in "${article_tags[@]}"; do
    echo "Processing article tag: $article_tag"

    # Get the latest patch version for the current article tag from the remote repository
    latest_article_patch=$(git tag -l "v${article_tag}.*" | sort -V | tail -n 1)
    if [ -z "$latest_article_patch" ]; then
        echo "No existing patch versions found for $article_tag. Skipping..."
        continue
    fi
    echo "Latest patch version for $article_tag: $latest_article_patch"
    
    # Checkout to the latest patch version
    git checkout "$latest_article_patch"
    
    # Increment the patch version
    IFS='.' read -r major minor patch <<< "${latest_article_patch}"
    new_article_patch=$((patch + 1))
    new_article_tag="${major}.${minor}.${new_article_patch}"
    echo "New article tag to be created: $new_article_tag"

    # Create a new tag
    git tag "$new_article_tag"
    # Cherry-pick the provided revision
    echo "Cherry-picking revision: $revision"
    git cherry-pick "$revision"

    if [ $? -ne 0 ]; then
        echo "Conflict detected while cherry-picking $revision. Please resolve the conflict and press Enter to continue."
        read -r
        git cherry-pick --continue
    fi
    echo "New article tag created: $new_article_tag"
    echo "Cherry-pick completed successfully."
    # git push origin "$new_article_tag"
    echo "Pushed new article tag: $new_article_tag"
done

consumeThemes

function consumeThemes() {
    # Prompt for applications to upgrade, or use default list if none provided
    # Multi-choice prompt for applications to upgrade
    default_apps=("ui-theme-eureka" "ui-core" "ui-theme-classic" "ui-theme-photo")
    echo "Select applications to upgrade (enter numbers separated by spaces, or press Enter for all):"
    for i in "${!default_apps[@]}"; do
        printf "  [%d] %s\n" "$((i+1))" "${default_apps[$i]}"
    done
    read -p "Your choice: " -a app_choices

    if [[ ${#app_choices[@]} -eq 0 ]]; then
        applications=("${default_apps[@]}")
    else
        applications=()
        for idx in "${app_choices[@]}"; do
            if [[ "$idx" =~ ^[0-9]+$ ]] && (( idx >= 1 && idx <= ${#default_apps[@]} )); then
                applications+=("${default_apps[$((idx-1))]}")
            fi
        done
    fi

    if [[ ${#applications[@]} -eq 0 ]]; then
        applications=("ui-theme-eureka" "ui-core" "ui-theme-classic" "ui-theme-photo")
    fi

    # Fetch latest tags and stash changes if any
    if ! git diff-index --quiet HEAD --; then
        git stash
        echo "Uncommitted changes have been stashed. You can apply them later using 'git stash pop'."
    fi
    git checkout develop
    git fetch --tags --all

    for app in "${applications[@]}"; do
        cd "../${app}" || continue
        echo "Processing application: $app"

        if [[ "$app" == "ui-theme-eureka" ]]; then
            # Get latest 3 minors from 1.* and 2.* and their latest patch
            for major in 1 2; do
                minors=$(git tag -l "v${major}.*" | awk -F. '{print $2}' | sort -nu | tail -n 3)
                for minor in $minors; do
                    latest_patch=$(git tag -l "v${major}.${minor}.*" | sort -V | tail -n 1)
                    if [[ -n "$latest_patch" ]]; then
                        git checkout "$latest_patch"
                        # Get latest ui-article tag
                        latest_article_tag=$(git ls-remote --tags git@github.com:atypon/ui-article.git | awk '{print $2}' | grep -E 'refs/tags/v[0-9]+\.[0-9]+\.[0-9]+' | sed 's|refs/tags/||' | sort -V | tail -n 1)
                        # Check if the current ui-article version matches the latest_article_tag
                        current_article_version=$(jq -r '.dependencies["ui-article"]' package.json | sed -E 's|.*#([^"]+)$|\1|')
                        if [[ "$current_article_version" == "$latest_article_tag" ]]; then
                            echo "ui-article is already at $latest_article_tag, skipping update."
                            continue
                        fi
                        jq --arg version "git+ssh://git@github.com:atypon/ui-article.git#${latest_article_tag}" '.dependencies["ui-article"] = $version' package.json > tmp.$$.json && mv tmp.$$.json package.json
                        git add package.json
                        git commit -m "Upgrade ui-article to $latest_article_tag"
                        IFS='.' read -r vmaj vmin vpatch <<< "${latest_patch#v}"
                        ((vpatch++))
                        new_tag="v${vmaj}.${vmin}.${vpatch}"
                        git tag "$new_tag"
                        # git push origin "$new_tag"
                        echo "Pushed new tag: $new_tag for $app"
                    fi
                done
            done
        else
            # For all other applications, upgrade ui-article to latest tag and create new tag for each existing tag
            for tag in "${tags[@]}"; do
                latest_theme_tag=$(git tag -l "v${tag}.*" | sort -V | tail -n 1)
                if [[ -z "$latest_theme_tag" ]]; then
                    echo "No tag found for $tag in $app"
                    continue
                fi
                git checkout "$latest_theme_tag"
                latest_article_tag=$(git ls-remote --tags git@github.com:atypon/ui-article.git | awk '{print $2}' | grep -E 'refs/tags/v[0-9]+\.[0-9]+\.[0-9]+' | sed 's|refs/tags/||' | sort -V | tail -n 1)
                current_article_version=$(jq -r '.dependencies["ui-article"]' package.json | sed -E 's|.*#([^"]+)$|\1|')
                if [[ "$current_article_version" == "$latest_article_tag" ]]; then
                    echo "ui-article is already at $latest_article_tag, skipping update."
                    continue
                fi
                jq --arg version "git+ssh://git@github.com:atypon/ui-article.git#${latest_article_tag}" '.dependencies["ui-article"] = $version' package.json > tmp.$$.json && mv tmp.$$.json package.json
                git add package.json
                git commit -m "Upgrade ui-article to $latest_article_tag"
                IFS='.' read -r vmaj vmin vpatch <<< "${latest_theme_tag#v}"
                ((vpatch++))
                new_tag="v${vmaj}.${vmin}.${vpatch}"
                # git tag "$new_tag"
                # git push origin "$new_tag"
                echo "Pushed new tag: $new_tag for $app"
            done
        fi
        cd - || exit
    done
}