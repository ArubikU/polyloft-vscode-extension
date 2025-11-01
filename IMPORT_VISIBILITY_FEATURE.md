# Import Visibility Validation

## Overview

This feature adds import validation based on visibility modifiers (public, private, protected) for all Polyloft symbols including classes, enums, records, interfaces, functions, and variables.

## Rules

All symbol types follow the same visibility rules:

### Public Symbols
Symbols declared with `public` modifier or no modifier at all can be imported from anywhere.

```polyloft
// lib.pf
public class PublicClass:
    def method(): end
end

public def publicFunction():
    println("Public function")
end

public const PUBLIC_CONSTANT = "value"

class ImplicitPublic:  // No modifier = public
    def method(): end
end

// anywhere.pf
import lib { PublicClass, publicFunction, PUBLIC_CONSTANT, ImplicitPublic }  // ✓ OK
```

### Protected Symbols
Symbols declared with `protected` modifier can only be imported from files in the same folder.

```polyloft
// folder/lib.pf
protected class ProtectedClass:
    def method(): end
end

protected def protectedFunction():
    println("Protected")
end

protected const PROTECTED_CONSTANT = "value"

// folder/main.pf (same folder)
import lib { ProtectedClass, protectedFunction, PROTECTED_CONSTANT }  // ✓ OK

// other_folder/main.pf (different folder)
import lib { ProtectedClass, protectedFunction, PROTECTED_CONSTANT }  // ✗ ERROR
```

### Private Symbols
Symbols declared with `private` modifier cannot be imported at all.

```polyloft
// lib.pf
private class PrivateClass:
    def method(): end
end

private def privateFunction():
    println("Private")
end

private const PRIVATE_CONSTANT = "value"

// main.pf
import lib { PrivateClass, privateFunction, PRIVATE_CONSTANT }  // ✗ ERROR: Cannot import private symbols
```

## Supported Symbol Types

The visibility validation works for all major Polyloft constructs:

### Classes
```polyloft
public class PublicClass: end
protected class ProtectedClass: end
private class PrivateClass: end
```

### Enums
```polyloft
public enum PublicEnum:
    VALUE1
    VALUE2
end

protected enum ProtectedEnum:
    VALUE1
end

private enum PrivateEnum:
    VALUE1
end
```

### Records
```polyloft
public record PublicRecord(x: Int, y: Int)
protected record ProtectedRecord(x: Int)
private record PrivateRecord(x: Int)
```

### Interfaces
```polyloft
public interface PublicInterface:
    method() -> Void
end

protected interface ProtectedInterface:
    method() -> Void
end

private interface PrivateInterface:
    method() -> Void
end
```

### Functions
```polyloft
public def publicFunction():
    println("Public")
end

protected def protectedFunction():
    println("Protected")
end

private def privateFunction():
    println("Private")
end
```

### Variables and Constants
```polyloft
public const PUBLIC_VAR = "public"
public var publicMutable = 0

protected const PROTECTED_VAR = "protected"
protected var protectedMutable = 0

private const PRIVATE_VAR = "private"
private var privateMutable = 0
```

## Error Messages

When an import violates visibility rules, the extension shows clear error messages:

1. **Private Symbol**: "Cannot import 'SymbolName': Private symbols cannot be imported"
2. **Protected Symbol from Different Folder**: "Cannot import 'SymbolName': Protected symbols can only be imported from the same folder"

## Implementation

### Method in src/linter.ts

**`getSymbolVisibility(fileContent: string, symbol: string)`**
- Extracts the visibility modifier from any symbol definition
- Checks for explicit modifiers: `public`, `private`, `protected`
- Returns 'public', 'private', 'protected', or undefined
- Handles implicit public (no modifier) for all symbol types
- Supports:
  - Classes: `(public|private|protected)? class SymbolName`
  - Enums: `(public|private|protected)? enum SymbolName`
  - Records: `(public|private|protected)? record SymbolName`
  - Interfaces: `(public|private|protected)? interface SymbolName`
  - Functions: `(public|private|protected)? def SymbolName(`
  - Variables: `(public|private|protected)? (const|var|let) SymbolName`

**`canImportSymbol(importingFilePath, importedFilePath, symbolVisibility)`**
- Validates if an import is allowed based on visibility and folder structure
- Returns `{ allowed: boolean, reason?: string }`

**`validateImports()`**
- Checks if the symbol exists in the imported file
- Extracts the symbol's visibility modifier
- Validates if the import is allowed based on visibility rules
- Shows appropriate error diagnostics for violations

## Technical Details

- Visibility checking uses regex patterns to match all declaration types
- Folder comparison is done using `path.dirname()` to get directory paths
- Validation happens during linting, providing real-time feedback
- All existing functionality remains intact (backward compatible)
- No modifier defaults to public for all symbol types

## Testing

Test files demonstrate the feature for all symbol types:
- `test_visibility_lib.pf` - Library with public/protected/private classes
- `test_visibility_functions_vars.pf` - Functions and variables with visibility modifiers
- `test_import_same_folder.pf` - Import from same folder (protected OK)
- `subfolder/test_import_different_folder.pf` - Import from different folder (protected fails)

These test files are excluded from git via `.gitignore`.
