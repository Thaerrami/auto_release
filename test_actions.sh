# for dir in $CLIENTS; do
# for dir in jmcp sage; do
set -e
for dir in jmcp sage; do
    echo "=== Processing directory: $dir ==="
    
    if [ ! -d "$dir" ]; then
    echo "Directory $dir does not exist, skipping"
    continue
    fi
    
    # Change to product directory
    cd "./$dir"
    echo "Changed to directory: $(pwd)"
    
    # Copy npmrc if it exists
    if [ -f "../.ci.npmrc" ]; then
    echo "Copying .ci.npmrc"
    cp -rf ../.ci.npmrc ./.npmrc
    else
    echo "No .ci.npmrc found"
    fi
    
    # Run utypon lint directly
    echo "Running utypon lint in $dir"
    echo "Command: utypon lint"
    
    # Temporarily disable exit on error to capture exit code
    set -e
    utypon lint --debug
    exit_code=$?
    
    echo "\$exit_code -eq 2 condition: [ $exit_code -eq 2 ]"
    echo "utypon lint exited with code: $exit_code" >&2
    
    # Check exit code and set flag for critical errors
    if [ $exit_code -eq 2 ]; then
        echo "Critical error detected (exit code 2) in $dir"
        critical_error=true
        echo "exit code for $dir is $exit_code"
    elif [ $exit_code -eq 1 ]; then
        echo "⚠ Warnings detected (exit code 1) in $dir, continuing"
    elif [ $exit_code -eq 0 ]; then
        echo "✓ utypon lint succeeded in $dir"
    fi
    
    # Return to parent directory
    cd ..
    echo "Returned to directory: $(pwd)"
done

# Exit with error code 2 if any critical errors were found
# set -e
if [ "$critical_error" = true ]; then
    echo "Build failed due to critical errors (exit code 2)"
    exit 2
fi