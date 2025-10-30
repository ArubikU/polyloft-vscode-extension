# 1
```println("3. Trie (Prefix Tree) Implementation")
println("   Efficient string search and autocomplete")
println("")```

`use 'String' instead of 'string'. Built-in class names must start with uppercase`
String content is being parsed as if it were code.

# 2
```
def createTrieNode():
    return {
        children: {},
        isEndOfWord: false
    }
end
```
`Unreachable code after return statement
Unreachable code detected`
Multi line return statements are being handled as if they were after the return statement.

# 3
Correct type infering
```

// Global trie root
let trieRoot: Map<String, Map<String, Any> | Bool> = createTrieNode()

def trieInsert(word):
    let node = trieRoot
    for i in 0...word.length()-1:
        let char = word[i]
        if !node["children"].hasKey(char):
            node["children"].set(char, createTrieNode())
        end
        node = node["children"].get(char)
    end
    println(Sys.type(node))
    node["isEndOfWord"] = true
end
```
```
trieRoot: Map
Global trie root

Declared at line 285```
is typed as `Map` instead of `Map<String, Map<String, Any> | Bool>.
```
Use 'Set' instead of 'set'. Built-in class names must start with uppercase
```
The node["children"].set(char, createTrieNode()) line throws a warning about using 'set' instead of 'Set'. is missleading because 'set' is a method of the Map class, not a built-in class name.

# 4
```

// BFS implementation using a queue (array)
def bfs(graph, start):
    let visited = {}
    let queue = [start]
    let order = []
    
    visited.set(start, true)
    
    // Process queue
    for step in range(20):  // Max iterations
        if queue.length() == 0:
            break
        end
        
        // Dequeue (remove first element)
        let current = queue[0]
        let newQueue = []
        for i in range(1, queue.length()):
            newQueue = newQueue.concat([queue[i]])
        end
        queue = newQueue
        
        order = order.concat([current])
        
        // Get neighbors
        let neighbors = graph.get(current)
        for i in range(neighbors.length()):
            let neighbor = neighbors[i]
            let isVisited = visited.hasKey(neighbor)
            if !isVisited:
                visited.set(neighbor, true)
                queue = queue.concat([neighbor])
            end
        end
    end
    
    return order
end
```
```
'break' statement can only be used inside loops
break keyword

Exits the current loop.

Example:

for i in 0...100:
    if i > 10:
        break
    end
end
```
The `break` statement inside the BFS function is being flagged as an error, even though it is correctly used within a loop.
Maybe the way that loops/functions deeply nested inside other functions are analyzed needs to be improved.
```
"return" statement outside of function
order: Any
Declared at line 25
```
Basically the same as above, but for the `return` statement.

# 5
```

let arr = [11, 12, 22, 23, 25, 34, 45, 50, 64, 88, 90]
```
```
arr: Any
Test the algorithm

Declared at line 36
```
Bad type infering, `arr` is typed as `Any` instead of `Array<Int>`.

# 6
Functions with return statements with values have return type Void
```
def mult(a,b):
    return a * b
end
let a = mult(3,4)

```
when hover mult shows return type as Void instead of Int
and when hover a shows type as Any instead of Int
