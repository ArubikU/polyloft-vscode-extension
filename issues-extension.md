# 1
´´´pf
let graph = {
    A: ["B", "C", "D"],
    B: ["E", "F"],
    C: [],
    D: ["G"],
    E: [],
    F: [],
    G: []
}
´´´
´´´
Unmatched brackets
graph: Any
Graph represented as adjacency list Each vertex maps to an array of its neighbors

Declared at line 11
´´´

The line is throwing 2 issues:
- Unmatched brackets: There is an opening bracket without a corresponding closing bracket.
  Even if the brackets appear to be balanced, the parser may have detected an inconsistency.
  I assume this could happen with multiline arrays too.
- graph: Any
    The type of 'graph' is inferred as 'Any', which is too generic.
    Consider providing a more specific type annotation to improve type safety and code clarity.
    when it should be inferred as Map<String, Array<String>> or similar.

# 2
´´´pf
def binarySearch(arr, target):
    let left = 0
    let right = arr.length() - 1
    
    for step in range(arr.length()):
        if left <= right:
            let mid = left + (right - left) / 2
            
            if arr[mid] == target:
                return mid
            else:
                if arr[mid] < target:
                    left = mid + 1
                else:
                    right = mid - 1
                end
            end
        else:
            break
        end
    end
    
    return -1
end
´´´

´´´
Multi-line block statement may be missing corresponding "end" keyword
arr: Any
Test the algorithm

Declared at line 36
´´´
The line is throwing 2 issues:
- Multi-line block statement may be missing corresponding "end" keyword:
    The parser suspects that a multi-line block statement (like if, for, while, etc.)
    may not be properly closed with an "end" keyword.
    If can be closed with a else or elif. later shoudl check the else and elif cases.
    if they have proper end keywords.
    also else can just be closed with end.
    elif with else and end.
    if with elif, else and end.
- arr: Any
    The type of 'arr' is inferred as 'Any', which is too generic.

# 3
´´´pf
// Graph as adjacency matrix: weights[from][to] = weight
// 0=A, 1=B, 2=C, 3=D, 4=E, 5=F
´´´
´´´
Division by zero will cause runtime error
´´´
The comment line is throwing 1 issue:
- Division by zero will cause runtime error:
The comment section should not have checking of this kind.