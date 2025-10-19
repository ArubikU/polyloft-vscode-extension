# Polyloft Language Support for Visual Studio Code

This extension provides comprehensive language support for Polyloft programming language.

## Features

### Syntax Highlighting
- Full syntax highlighting for `.pf` files
- Support for all Polyloft keywords, operators, and language constructs
- String interpolation highlighting with `#{expression}` syntax

### Linting
- Real-time error detection and reporting
- Syntax validation including:
  - **Const and final variable reassignment detection**
  - **Break/continue outside loop detection**
  - **Duplicate variable declaration detection**
  - **Unreachable code detection**
- Best practice warnings (type annotations, formatting)
- Configurable linting options

### Auto-completion
- Keyword completion
- Built-in function completion (println, print, etc.)
- Standard library completion (Sys, Math, etc.)
- User-defined class, function, and variable completion
- Import symbol completion
- Smart member completion after dot operator
- **Enum completion**: Enum values and static methods (valueOf, values, size, names)
- **Enum instance completion**: Enum value fields (name, ordinal) and custom methods
- **Record completion**: Record component fields and custom methods
- **Class method completion**: Built-in methods like toString()

### Go to Definition
- Jump to class definitions
- Jump to function definitions
- Jump to variable declarations
- Cross-file navigation for imports

### Hover Information
- Type information on hover
- Function signatures with parameters and return types
- Documentation for built-in functions and methods
- Class inheritance information

### Multi-file Support
- Parse and understand import statements
- Cross-file symbol resolution
- Support for standard library imports

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

### System Functions (Sys)
- `Sys.time()` - Get current time in milliseconds
- `Sys.random()` - Generate random float
- `Sys.sleep(ms)` - Sleep for milliseconds

### Math Functions (Math)
- Constants: `Math.PI`, `Math.E`
- Functions: `sqrt`, `pow`, `abs`, `sin`, `cos`, `tan`, `floor`, `ceil`, `round`, `min`, `max`

### Standard Library
- `math.vector` - Vector mathematics (Vec2, Vec3, Vec4)
- `utils` - General utility functions

## Usage

1. Install the extension
2. Open any `.pf` file
3. Start coding with full IntelliSense support

## Language Examples

### Classes and Objects
```polyloft
import math.vector { Vec2, Vec3 }

class Player
    var position: Vec2
    var health: Int

    Player(x: Float, y: Float):
        this.position = Vec2(x, y)
        this.health = 100
    end

    def move(dx: Float, dy: Float) -> Void:
        this.position = this.position + Vec2(dx, dy)
    end
end

let player = Player(0.0, 0.0)
player.move(10.0, 5.0)
println("Player position:", player.position.to_s())
```

### Enums
```polyloft
// Simple enum
enum Color
    RED
    GREEN
    BLUE
end

// Enum with methods
enum Status
    PENDING
    ACTIVE
    COMPLETED
    
    def isFinished():
        return this.name == "COMPLETED"
    end
end

// Using enums - IntelliSense will suggest:
// Color. -> RED, GREEN, BLUE, valueOf(), values(), size(), names()
let color = Color.RED

// Color.RED. -> name, ordinal, toString()
println(color.name)           // "RED"
println(color.ordinal)        // 0

// Static methods
let allColors = Color.values()
let green = Color.valueOf("GREEN")
```

### Records
```polyloft
// Record with components and methods
record Point(x: Int, y: Int)
    def sum():
        return this.x + this.y
    end
    
    def distance():
        return Math.sqrt(this.x * this.x + this.y * this.y)
    end
end

// Using records - IntelliSense will suggest:
// point. -> x, y, sum(), distance(), toString()
let point = Point(3, 4)
println(point.x)              // 3
println(point.sum())          // 7
println(point.toString())     // "Point(x=3, y=4)"
```

## Requirements

- Visual Studio Code 1.75.0 or higher

## Known Issues

- None at this time

## Contributing

Contributions are welcome! Please visit the [GitHub repository](https://github.com/ArubikU/polyloft) to contribute.

## License

This extension is licensed under the same license as the Polyloft language.
