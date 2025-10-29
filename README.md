# Polyloft Language Support for Visual Studio Code

This extension provides comprehensive language support for Polyloft programming language.

## Features

### Syntax Highlighting
- Full syntax highlighting for `.pf` and `.pfx` files
- Support for all Polyloft keywords, operators, and language constructs
- String interpolation highlighting with `#{expression}` syntax
- Comments: `//` line comments and `/* */` block comments
- Keywords: `let`, `def`, `class`, `if`, `elif`, `for`, `loop`, `where`, `return`, `break`, `continue`, `end`
- Logical operators: `&&`, `||`, `!` (note: `and`, `or`, `not` keywords do not exist in Polyloft)
- Ranges: `0...10` (three dots only, not two)
- Type annotations: `let x: Int = 5`, `def foo() -> Int:`

### Linting
- Real-time error detection and reporting
- **Enhanced type checking**: Basic type inference and type mismatch detection
- Syntax validation including:
  - **Const and final variable reassignment detection**
  - **Break/continue outside loop detection**
  - **Duplicate variable declaration detection**
  - **Unreachable code detection** (after return, break, continue, throw)
  - **Division by zero detection**
  - **Logical operator errors** (detecting 'and'/'or'/'not' keywords that don't exist)
  - **Range operator errors** (detecting '..' instead of '...')
  - **String interpolation errors** (detecting '${}'  instead of '#{}')
  - **Type mismatches in assignments and comparisons**
- Best practice warnings (type annotations, naming conventions, indentation)
- Configurable linting options

### Auto-completion
- **Smart keyword completion** with context-aware suggestions
- **Enhanced code snippets**: Pre-built templates for classes, functions, enums, records, and more
- Built-in function completion (println, print, len, range, int, float, str, bool, etc.)
- Standard library completion (Sys, Math, Array, String, Map, etc.)
- User-defined class, function, and variable completion
- Import symbol completion
- Smart member completion after dot operator
- **Enum completion**: Enum values and static methods (valueOf, values, size, names)
- **Enum instance completion**: Enum value fields (name, ordinal) and custom methods
- **Record completion**: Record component fields and custom methods
- **Class method completion**: Built-in methods like toString()
- **Snippet templates**: Complete code structures for common patterns (if-else, try-catch, for loops, etc.)

### Go to Definition
- Jump to class definitions
- Jump to function definitions
- Jump to variable declarations
- Cross-file navigation for imports

### Hover Information
- **Enhanced keyword documentation** with examples for all Polyloft keywords
- Type information on hover
- Function signatures with parameters and return types
- Documentation for built-in functions and methods
- Class inheritance information
- **Interactive examples** showing proper usage of language features

### Multi-file Support
- Parse and understand import statements
- Cross-file symbol resolution
- Support for standard library imports

## Advanced Features

### Intelligent Code Snippets
The extension provides powerful code snippets for rapid development:

- **`class`**: Complete class template with constructor and methods
- **`record`**: Record definition with fields and methods
- **`enum`**: Enumeration with multiple values
- **`def`**: Function with parameters and return type
- **`for where`**: For loop with filtering where clause
- **`for range`**: For loop with range iteration
- **`if else`**: Complete if-elif-else conditional
- **`try catch`**: Try-catch-finally error handling block
- **`switch`**: Switch-case statement with default
- **`main`**: Main function template as entry point
- **`import`**: Import statement with symbols

### Type Safety
- Basic type inference for variable declarations
- Type mismatch detection in assignments
- Incompatible type warnings in comparisons
- Numeric type promotion support (Int → Float → Double)

### Error Prevention
- Detects common mistakes before runtime:
  - Using `and`/`or`/`not` instead of `&&`/`||`/`!`
  - Using `..` instead of `...` for ranges
  - Using `${}` instead of `#{}` for string interpolation
  - Division by zero
  - Unreachable code after control flow statements

### Best Practices
- Naming convention enforcement (classes, enums, records start with uppercase)
- Type annotation recommendations
- Indentation consistency hints
- Unused import detection

## Configuration

The extension can be configured through VS Code settings:

```json
{
  "polyloft.linting.enabled": true,
  "polyloft.linting.onType": true,
  "polyloft.completion.enabled": true,
  "polyloft.trace.server": "off"
}
```

## Built-in Support

The extension includes built-in support for:

### Global Functions
- `println(...)` - Print to stdout with newline
- `print(...)` - Print to stdout without newline
- `len(...)` - Get length of collection
- `range(...)` - Generate range of numbers
- `int(...)` - Convert to integer
- `float(...)` - Convert to float
- `str(...)` - Convert to string
- `bool(...)` - Convert to boolean

### System Functions (Sys)
- `Sys.time()` - Get current time in milliseconds
- `Sys.random()` - Generate random float
- `Sys.sleep(ms)` - Sleep for milliseconds

### Math Functions (Math)
- Constants: `Math.PI`, `Math.E`
- Functions: `sqrt`, `pow`, `abs`, `sin`, `cos`, `tan`, `floor`, `ceil`, `round`, `min`, `max`

### Built-in Types
- `Int`, `Float`, `String`, `Bool`, `Void`, `Any`
- `Array`, `Map`, `List`, `Set`, `Deque`, `Tuple`, `Pair`
- `Range`, `Bytes`
- `Promise`, `CompletableFuture`
- `HttpServer`, `HttpRequest`, `HttpResponse`

### Built-in Classes
- `Sys`, `Math`, `Array`, `String`, `Map`, `Set`, `List`
- `Tuple`, `Deque`, `Range`, `Bytes`
- `Generic`, `Object`, `Cronometer`
- `Net`, `Http`, `IO`, `File`, `Socket`
- `Promise`, `CompletableFuture`

## Usage

1. Install the extension
2. Open any `.pf` file
3. Start coding with full IntelliSense support

## Language Examples

### Classes and Objects
```polyloft
class Point:
    let x
    let y
    
    def init(x, y):
        this.x = x
        this.y = y
    end
    
    def distance():
        return Math.sqrt(this.x * this.x + this.y * this.y)
    end
end

let p = Point(3, 4)
println("Distance from origin: " + p.distance())  // 5.0
```

### Functions and Loops
```polyloft
// Fibonacci using iterative approach
def fibonacci(n):
    if n <= 1:
        return n
    end
    
    let a = 0
    let b = 1
    
    for i in range(2, n + 1):
        let temp = a + b
        a = b
        b = temp
    end
    
    return b
end

println("Fib(10) = " + fibonacci(10))  // 55
```

### Where Clause
```polyloft
let numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
let sum = 0

// Filter with where clause
for n in numbers where n > 5:
    sum = sum + n
end

println("Sum of numbers > 5: " + sum)  // 40
```

### Enums
```polyloft
enum Color
    RED
    GREEN
    BLUE
end

let color = Color.RED
println(color.name)      // "RED"
println(color.ordinal)   // 0

// Static methods
let allColors = Color.values()
let green = Color.valueOf("GREEN")
```

### Records
```polyloft
record Point(x: Int, y: Int)
    def sum():
        return this.x + this.y
    end
end

let point = Point(3, 4)
println(point.x)        // 3
println(point.sum())    // 7
```

### String Interpolation and Ranges
```polyloft
let name = "Alice"
let age = 25
println("Hello, #{name}! You are #{age} years old.")

// Range with ... (three dots)
for i in 0...10:
    println(i)  // Prints 0 through 10
end
```

### Logical Operators
```polyloft
// Use &&, ||, ! (NOT and, or, not)
let a = true
let b = false

if a && !b:
    println("a is true and b is false")
end

if a || b:
    println("At least one is true")
end
```

## Requirements

- Visual Studio Code 1.75.0 or higher

## Known Issues

- None at this time

## Contributing

Contributions are welcome! Please visit the [GitHub repository](https://github.com/ArubikU/polyloft) to contribute.

## License

This extension is licensed under the same license as the Polyloft language.
