# Import Visibility Validation

## Overview

This feature adds import validation based on class visibility modifiers (public, private, protected) in Polyloft.

## Rules

### Public Classes
Classes declared with `public` modifier or no modifier at all can be imported from anywhere.

```polyloft
// lib.pf
public class PublicClass:
    def method(): end
end

class ImplicitPublic:  // No modifier = public
    def method(): end
end

// anywhere.pf
import lib { PublicClass, ImplicitPublic }  // ✓ OK
```

### Protected Classes
Classes declared with `protected` modifier can only be imported from files in the same folder.

```polyloft
// folder/lib.pf
protected class ProtectedClass:
    def method(): end
end

// folder/main.pf (same folder)
import lib { ProtectedClass }  // ✓ OK

// other_folder/main.pf (different folder)
import lib { ProtectedClass }  // ✗ ERROR
```

### Private Classes
Classes declared with `private` modifier cannot be imported at all.

```polyloft
// lib.pf
private class PrivateClass:
    def method(): end
end

// main.pf
import lib { PrivateClass }  // ✗ ERROR: Cannot import private symbols
```

## Error Messages

When an import violates visibility rules, the extension shows clear error messages:

1. **Private Symbol**: "Cannot import 'ClassName': Private symbols cannot be imported"
2. **Protected Symbol from Different Folder**: "Cannot import 'ClassName': Protected symbols can only be imported from the same folder"

## Implementation

### New Methods (src/linter.ts)

1. **`getSymbolVisibility(fileContent: string, symbol: string)`**
   - Extracts the visibility modifier from a class/enum/record/interface definition
   - Returns 'public', 'private', 'protected', or undefined
   - Handles implicit public (no modifier)

2. **`canImportSymbol(importingFilePath, importedFilePath, symbolVisibility)`**
   - Validates if an import is allowed based on visibility and folder structure
   - Returns `{ allowed: boolean, reason?: string }`

### Enhanced Method

**`validateImports()`** now:
1. Checks if the symbol exists in the imported file
2. Extracts the symbol's visibility modifier
3. Validates if the import is allowed based on visibility rules
4. Shows appropriate error diagnostics for violations

## Technical Details

- Visibility checking uses regex patterns to match class/enum/record/interface declarations
- Folder comparison is done using `path.dirname()` to get directory paths
- Validation happens during linting, providing real-time feedback
- All existing functionality remains intact (backward compatible)

## Testing

Created test files to demonstrate the feature:
- `test_visibility_lib.pf` - Library with public/protected/private classes
- `test_import_same_folder.pf` - Import from same folder (protected OK)
- `subfolder/test_import_different_folder.pf` - Import from different folder (protected fails)

These test files are excluded from git via `.gitignore`.
