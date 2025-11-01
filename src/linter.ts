import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface Token {
    type: string;
    value: string;
    line: number;
    column: number;
}

export class PolyloftLinter {
    private keywords = [
        'var', 'let', 'const', 'final', 'def', 'class', 'interface', 'import',
        'implements', 'abstract', 'sealed', 'return', 'if', 'elif', 'else',
        'for', 'in', 'loop', 'break', 'continue', 'end', 'do', 'true', 'false',
        'nil', 'null', 'thread', 'spawn', 'join', 'public', 'pub', 'private', 'priv',
        'protected', 'prot', 'static', 'this', 'super', 'instanceof', 'enum',
        'record', 'try', 'catch', 'finally', 'throw', 'defer', 'switch', 'case',
        'default', 'where', 'from', 'as', 'export', 'extends', 'out'
    ];

    public lint(document: vscode.TextDocument, diagnosticCollection: vscode.DiagnosticCollection): void {
        const config = vscode.workspace.getConfiguration('polyloft');
        if (!config.get('linting.enabled')) {
            return;
        }

        const diagnostics: vscode.Diagnostic[] = [];
        const text = document.getText();
        const lines = text.split('\n');

        // Track class and function definitions
        const classNames = new Set<string>();
        const functionNames = new Set<string>();
        const variableNames = new Set<string>();
        const constVariables = new Map<string, number>(); // Track const/final variables with line number
        const finalVariables = new Map<string, number>();

        // First pass: collect definitions
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Find class definitions
            const classMatch = line.match(/^\s*class\s+([A-Z][a-zA-Z0-9_]*)/);
            if (classMatch) {
                classNames.add(classMatch[1]);
            }

            // Find function definitions
            const funcMatch = line.match(/^\s*def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
            if (funcMatch) {
                functionNames.add(funcMatch[1]);
            }

            // Check for double declarators (e.g., "final const x")
            const doubleDeclaratorMatch = line.match(/^\s*(var|let|const|final)\s+(var|let|const|final)\s+/);
            if (doubleDeclaratorMatch) {
                const range = new vscode.Range(i, 0, i, line.length);
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        `Cannot use multiple declarators (${doubleDeclaratorMatch[1]} ${doubleDeclaratorMatch[2]}). Use only one.`,
                        vscode.DiagnosticSeverity.Error
                    )
                );
            }

            // Find variable declarations with const/final tracking
            const varMatch = line.match(/^\s*(var|let|const|final)\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
            if (varMatch && !doubleDeclaratorMatch) {
                const varType = varMatch[1];
                const varName = varMatch[2];
                variableNames.add(varName);
                
                if (varType === 'const') {
                    constVariables.set(varName, i);
                } else if (varType === 'final') {
                    finalVariables.set(varName, i);
                }
            }
        }

        // Second pass: check for errors
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Check for unclosed strings
            const stringMatches = line.match(/"/g);
            if (stringMatches && stringMatches.length % 2 !== 0) {
                const range = new vscode.Range(i, 0, i, line.length);
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        'Unclosed string literal',
                        vscode.DiagnosticSeverity.Error
                    )
                );
            }

            // Skip line-by-line bracket checking for multi-line structures
            // We'll do a global bracket check after the loop instead

            // Check for missing 'end' keyword after block statements
            // But skip inline statements (single-line after :)
            const blockMatch = line.match(/^\s*(def|class|interface|if|elif|else|for|loop|try|catch|finally|switch|record|enum)\b.*:\s*(.*)$/);
            if (blockMatch) {
                const afterColon = blockMatch[2].trim();
                
                // Skip if it's an inline statement (has code after the colon)
                if (afterColon && !afterColon.startsWith('//')) {
                    // This is inline syntax, doesn't need 'end'
                    continue;
                }
                
                // Look for corresponding 'end', 'elif', or 'else'
                let foundEnd = false;
                let foundElifOrElse = false;
                for (let j = i + 1; j < lines.length; j++) {
                    const currentIndent = line.match(/^\s*/)?.[0].length || 0;
                    const checkIndent = lines[j].match(/^\s*/)?.[0].length || 0;
                    const checkLine = lines[j].trim();
                    
                    // If we find 'end' at the same indentation, we're good
                    if (checkIndent === currentIndent && checkLine.match(/^\s*end\s*$/)) {
                        foundEnd = true;
                        break;
                    }
                    
                    // If we find 'elif' or 'else' at the same indentation (for if blocks), they count as block continuation
                    if (checkIndent === currentIndent && checkLine.match(/^\s*(elif|else):/)) {
                        const keyword = blockMatch[1];
                        // elif/else can close an if block
                        if (keyword === 'if') {
                            foundElifOrElse = true;
                            break;
                        }
                    }
                    
                    // Stop searching if we hit another block start at same or lower indentation (but not elif/else)
                    if (checkIndent <= currentIndent && 
                        checkLine.match(/^\s*(def|class|interface|if|for|loop|try|catch|finally|switch|record|enum)\b/) &&
                        !checkLine.match(/^\s*(elif|else):/)) {
                        break;
                    }
                }
                
                // For 'if' blocks, either 'end', 'elif', or 'else' are acceptable
                const blockKeyword = blockMatch[1];
                const isIfBlock = blockKeyword === 'if';
                const hasProperTermination = foundEnd || (isIfBlock && foundElifOrElse);
                
                if (!hasProperTermination && !line.match(/^\s*(else|elif|case|default):/)) {
                    const range = new vscode.Range(i, 0, i, line.length);
                    diagnostics.push(
                        new vscode.Diagnostic(
                            range,
                            'Multi-line block statement may be missing corresponding "end" keyword',
                            vscode.DiagnosticSeverity.Warning
                        )
                    );
                }
            }

            // Check for invalid function/method declarations (missing parentheses)
            const invalidDefMatch = line.match(/^\s*def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?!\()/);
            if (invalidDefMatch && !line.match(/^\s*def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/)) {
                const range = new vscode.Range(i, 0, i, line.length);
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        'Function definition must be followed by parameter list in parentheses',
                        vscode.DiagnosticSeverity.Error
                    )
                );
            }

            // Check for lowercase class names (convention warning)
            const classDefMatch = line.match(/^\s*(?:(?:public|private|protected|sealed|abstract)\s+)*class\s+([a-z][a-zA-Z0-9_]*)/);
            if (classDefMatch) {
                const range = new vscode.Range(i, 0, i, line.length);
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        'Class names should start with an uppercase letter',
                        vscode.DiagnosticSeverity.Warning
                    )
                );
            }

            // Check for lowercase enum names (convention warning)
            const enumDefMatch = line.match(/^\s*(?:(?:public|private|protected|sealed)\s+)*enum\s+([a-z][a-zA-Z0-9_]*)/);
            if (enumDefMatch) {
                const range = new vscode.Range(i, 0, i, line.length);
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        'Enum names should start with an uppercase letter',
                        vscode.DiagnosticSeverity.Warning
                    )
                );
            }

            // Check for lowercase record names (convention warning)
            const recordDefMatch = line.match(/^\s*(?:(?:public|private|protected)\s+)*record\s+([a-z][a-zA-Z0-9_]*)/);
            if (recordDefMatch) {
                const range = new vscode.Range(i, 0, i, line.length);
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        'Record names should start with an uppercase letter',
                        vscode.DiagnosticSeverity.Warning
                    )
                );
            }

            // Check for lowercase interface names (convention warning)
            const interfaceDefMatch = line.match(/^\s*(?:(?:public|private|protected)\s+)*interface\s+([a-z][a-zA-Z0-9_]*)/);
            if (interfaceDefMatch) {
                const range = new vscode.Range(i, 0, i, line.length);
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        'Interface names should start with an uppercase letter',
                        vscode.DiagnosticSeverity.Warning
                    )
                );
            }

            // Check for annotations without proper formatting
            const annotationMatch = line.match(/^\s*@([a-zA-Z_][a-zA-Z0-9_]*)/);
            if (annotationMatch) {
                // Verify the annotation is followed by a valid construct (method, class, etc.)
                let nextNonEmptyLine = '';
                for (let j = i + 1; j < lines.length; j++) {
                    const nextLine = lines[j].trim();
                    if (nextLine && !nextLine.startsWith('//') && !nextLine.startsWith('/*')) {
                        nextNonEmptyLine = nextLine;
                        break;
                    }
                }
                
                const validAnnotationTarget = nextNonEmptyLine.match(/^\s*(def|class|enum|record|interface|public|private|protected|static|abstract|sealed)\b/);
                if (!validAnnotationTarget && nextNonEmptyLine) {
                    const range = new vscode.Range(i, 0, i, line.length);
                    diagnostics.push(
                        new vscode.Diagnostic(
                            range,
                            'Annotations must be followed by a class, method, field, or other valid declaration',
                            vscode.DiagnosticSeverity.Warning
                        )
                    );
                }
            }

            // Check for use of 'this' outside of class/enum/record methods
            if (line.includes('this.') && !this.isInsideClassLikeStructure(lines, i)) {
                const thisIndex = line.indexOf('this.');
                const range = new vscode.Range(i, thisIndex, i, thisIndex + 4);
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        '"this" can only be used inside class, enum, or record methods',
                        vscode.DiagnosticSeverity.Error
                    )
                );
            }

            // Check for return outside function
            const returnMatch = line.match(/^\s*return\b/);
            if (returnMatch && !this.isInsideFunction(lines, i)) {
                const range = new vscode.Range(i, 0, i, line.length);
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        '"return" statement outside of function',
                        vscode.DiagnosticSeverity.Error
                    )
                );
            }

            // Check for reassignment of const variables
            const constReassignMatch = line.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=/);
            if (constReassignMatch) {
                const varName = constReassignMatch[1];
                if (constVariables.has(varName)) {
                    const declLine = constVariables.get(varName)!;
                    const varIndex = line.indexOf(varName);
                    const range = new vscode.Range(i, varIndex, i, varIndex + varName.length);
                    diagnostics.push(
                        new vscode.Diagnostic(
                            range,
                            `Cannot reassign const variable '${varName}' (declared on line ${declLine + 1})`,
                            vscode.DiagnosticSeverity.Error
                        )
                    );
                }
            }

            // Check for reassignment of final variables
            const finalReassignMatch = line.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=/);
            if (finalReassignMatch) {
                const varName = finalReassignMatch[1];
                if (finalVariables.has(varName)) {
                    const declLine = finalVariables.get(varName)!;
                    const varIndex = line.indexOf(varName);
                    const range = new vscode.Range(i, varIndex, i, varIndex + varName.length);
                    diagnostics.push(
                        new vscode.Diagnostic(
                            range,
                            `Cannot reassign final variable '${varName}' (declared on line ${declLine + 1})`,
                            vscode.DiagnosticSeverity.Error
                        )
                    );
                }
            }

            // Check for break/continue outside of loops
            if (line.match(/^\s*(break|continue)\b/)) {
                if (!this.isInsideLoop(lines, i)) {
                    const range = new vscode.Range(i, 0, i, line.length);
                    const keyword = line.match(/^\s*(break|continue)\b/)?.[1];
                    diagnostics.push(
                        new vscode.Diagnostic(
                            range,
                            `'${keyword}' statement can only be used inside loops`,
                            vscode.DiagnosticSeverity.Error
                        )
                    );
                }
            }

            // Check for duplicate variable declarations
            const duplicateVarMatch = line.match(/^\s*(var|let|const|final)\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
            if (duplicateVarMatch) {
                const varName = duplicateVarMatch[2];
                // Check if variable was already declared earlier in the same scope
                for (let j = 0; j < i; j++) {
                    const prevLine = lines[j];
                    const prevMatch = prevLine.match(/^\s*(var|let|const|final)\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
                    if (prevMatch && prevMatch[2] === varName && this.isSameScope(lines, j, i)) {
                        const varIndex = line.indexOf(varName);
                        const range = new vscode.Range(i, varIndex, i, varIndex + varName.length);
                        diagnostics.push(
                            new vscode.Diagnostic(
                                range,
                                `Variable '${varName}' is already declared in this scope (line ${j + 1})`,
                                vscode.DiagnosticSeverity.Error
                            )
                        );
                        break;
                    }
                }
            }

            // Check for missing type annotation in function parameters (warning)
            const funcParamMatch = line.match(/^\s*def\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\(([^)]+)\)/);
            if (funcParamMatch) {
                const params = funcParamMatch[1];
                // Check if any parameter lacks type annotation
                const paramList = params.split(',').map(p => p.trim()).filter(p => p.length > 0);
                for (const param of paramList) {
                    if (!param.includes(':') && !param.match(/^\.\.\./)) { // Ignore variadic params
                        const range = new vscode.Range(i, 0, i, line.length);
                        diagnostics.push(
                            new vscode.Diagnostic(
                                range,
                                'Function parameters should have type annotations',
                                vscode.DiagnosticSeverity.Hint
                            )
                        );
                        break;
                    }
                }
            }

            // Return type is optional in Polyloft, so we don't warn about missing return types

            // Check for unreachable code after return
            if (line.match(/^\s*return\b/)) {
                // Check if this is a multi-line return (e.g., return { ... })
                const returnLine = line.trim();
                const isMultiLineReturn = returnLine.match(/return\s*[{\[\(]\s*$/) || 
                                          (returnLine.match(/return\s+[{\[\(]/) && !returnLine.match(/[}\]\)]\s*$/));
                
                if (isMultiLineReturn) {
                    // Multi-line return statement, don't flag next lines as unreachable
                    // Wait until we find the closing bracket/paren/brace
                    continue;
                }
                
                // Look ahead for non-empty, non-comment lines before 'end'
                for (let j = i + 1; j < lines.length; j++) {
                    const nextLine = lines[j].trim();
                    if (nextLine === 'end' || nextLine === '') {
                        break;
                    }
                    if (!nextLine.startsWith('//') && !nextLine.startsWith('/*')) {
                        const range = new vscode.Range(j, 0, j, lines[j].length);
                        diagnostics.push(
                            new vscode.Diagnostic(
                                range,
                                'Unreachable code after return statement',
                                vscode.DiagnosticSeverity.Warning
                            )
                        );
                        break;
                    }
                }
            }

            // Check for unused imports (warning)
            const importMatch = line.match(/^\s*import\s+[a-zA-Z._/]+\s*\{\s*([^}]+)\s*\}/);
            if (importMatch) {
                const symbols = importMatch[1].split(',').map(s => s.trim());
                for (const symbol of symbols) {
                    let used = false;
                    for (let j = i + 1; j < lines.length; j++) {
                        if (lines[j].includes(symbol)) {
                            used = true;
                            break;
                        }
                    }
                    if (!used) {
                        const symbolIndex = line.indexOf(symbol);
                        const range = new vscode.Range(i, symbolIndex, i, symbolIndex + symbol.length);
                        diagnostics.push(
                            new vscode.Diagnostic(
                                range,
                                `Imported symbol '${symbol}' is not used`,
                                vscode.DiagnosticSeverity.Hint
                            )
                        );
                    }
                }
            }

            // Check for inconsistent indentation (warning)
            if (line.trim().length > 0 && !line.trim().startsWith('//')) {
                const indent = line.match(/^\s*/)?.[0].length || 0;
                if (indent % 4 !== 0) {
                    const range = new vscode.Range(i, 0, i, indent);
                    diagnostics.push(
                        new vscode.Diagnostic(
                            range,
                            'Inconsistent indentation (should be multiples of 4 spaces)',
                            vscode.DiagnosticSeverity.Hint
                        )
                    );
                }
            }
        }

        // Third pass: Enhanced type checking and unreachable code detection
        this.performTypeChecking(lines, diagnostics);
        this.detectUnreachableCode(lines, diagnostics);
        this.detectRangeOperatorErrors(lines, diagnostics);
        this.detectStringInterpolationIssues(lines, diagnostics);
        this.detectCasingIssues(lines, diagnostics);
        this.validateForWhereClause(lines, diagnostics);
        this.validateLambdaSyntax(lines, diagnostics);
        this.validateSwitchCaseSyntax(lines, diagnostics);
        this.checkBracketBalance(lines, diagnostics);
        this.validateImports(document, lines, diagnostics);

        diagnosticCollection.set(document.uri, diagnostics);
    }

    /**
     * Check for unmatched brackets across the entire document
     */
    private checkBracketBalance(lines: string[], diagnostics: vscode.Diagnostic[]): void {
        let bracketStack: { line: number; char: string }[] = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Skip comment lines
            if (line.trim().startsWith('//') || line.trim().startsWith('/*')) {
                continue;
            }
            
            // Track brackets, skipping strings
            for (let j = 0; j < line.length; j++) {
                if (this.isInsideString(line, j)) {
                    continue;
                }
                
                const char = line[j];
                if (char === '{' || char === '[' || char === '(') {
                    bracketStack.push({ line: i, char: char });
                } else if (char === '}' || char === ']' || char === ')') {
                    const expected = char === '}' ? '{' : char === ']' ? '[' : '(';
                    if (bracketStack.length === 0) {
                        const range = new vscode.Range(i, j, i, j + 1);
                        diagnostics.push(
                            new vscode.Diagnostic(
                                range,
                                `Unexpected closing bracket '${char}' without matching opening bracket`,
                                vscode.DiagnosticSeverity.Error
                            )
                        );
                    } else {
                        const last = bracketStack.pop()!;
                        if (last.char !== expected) {
                            const range = new vscode.Range(i, j, i, j + 1);
                            diagnostics.push(
                                new vscode.Diagnostic(
                                    range,
                                    `Mismatched bracket: expected '${expected === '{' ? '}' : expected === '[' ? ']' : ')'}' but found '${char}'`,
                                    vscode.DiagnosticSeverity.Error
                                )
                            );
                        }
                    }
                }
            }
        }
        
        // Check for unclosed brackets
        for (const unclosed of bracketStack) {
            const closing = unclosed.char === '{' ? '}' : unclosed.char === '[' ? ']' : ')';
            const range = new vscode.Range(unclosed.line, 0, unclosed.line, lines[unclosed.line].length);
            diagnostics.push(
                new vscode.Diagnostic(
                    range,
                    `Unclosed bracket '${unclosed.char}' (expected '${closing}')`,
                    vscode.DiagnosticSeverity.Warning
                )
            );
        }
    }

    /**
     * Helper: Check if a position in a line is inside a string literal
     */
    private isInsideString(line: string, position: number): boolean {
        let inDoubleQuote = false;
        let inSingleQuote = false;
        let escaped = false;
        
        for (let i = 0; i < position; i++) {
            const char = line[i];
            
            if (escaped) {
                escaped = false;
                continue;
            }
            
            if (char === '\\') {
                escaped = true;
                continue;
            }
            
            if (char === '"' && !inSingleQuote) {
                inDoubleQuote = !inDoubleQuote;
            } else if (char === "'" && !inDoubleQuote) {
                inSingleQuote = !inSingleQuote;
            }
        }
        
        return inDoubleQuote || inSingleQuote;
    }

    /**
     * Enhanced: Detect common casing mistakes and suggest corrections
     */
    private detectCasingIssues(lines: string[], diagnostics: vscode.Diagnostic[]): void {
        const builtinClasses = ['Sys', 'Math', 'String', 'Array', 'Map', 'Set', 'List', 'Http', 'IO', 'Crypto', 'Regex'];
        const builtinFunctions = ['println', 'print', 'len', 'range', 'int', 'float', 'str', 'bool'];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (line.trim().startsWith('//')) {
                continue;
            }
            
            // Skip import statements - they can have lowercase paths like "test.math.vector"
            if (line.trim().match(/^\s*import\s+/)) {
                continue;
            }
            
            // Check for lowercase builtin classes
            for (const className of builtinClasses) {
                const lowerCase = className.toLowerCase();
                // Don't flag if followed by '(' (method call) or preceded by '.' (member access)
                const pattern = new RegExp(`(?<!\\.)\\b${lowerCase}\\b(?!\\s*[:(])`, 'gi');
                let match;
                
                while ((match = pattern.exec(line)) !== null) {
                    // Skip if it's the correct casing
                    if (match[0] === className) {
                        continue;
                    }
                    
                    // Skip if inside a string literal
                    if (this.isInsideString(line, match.index)) {
                        continue;
                    }
                    
                    const range = new vscode.Diagnostic(
                        new vscode.Range(i, match.index, i, match.index + match[0].length),
                        `Use '${className}' instead of '${match[0]}'. Built-in class names must start with uppercase`,
                        vscode.DiagnosticSeverity.Warning
                    );
                    diagnostics.push(range);
                }
            }
            
            // Check for uppercase builtin functions
            for (const funcName of builtinFunctions) {
                const upperCase = funcName.toUpperCase();
                const titleCase = funcName.charAt(0).toUpperCase() + funcName.slice(1);
                const patterns = [upperCase, titleCase];
                
                for (const wrongCase of patterns) {
                    const pattern = new RegExp(`\\b${wrongCase}\\s*\\(`, 'g');
                    let match;
                    
                    while ((match = pattern.exec(line)) !== null) {
                        // Skip if inside a string literal
                        if (this.isInsideString(line, match.index)) {
                            continue;
                        }
                        
                        const range = new vscode.Diagnostic(
                            new vscode.Range(i, match.index, i, match.index + wrongCase.length),
                            `Use '${funcName}' instead of '${wrongCase}'. Built-in functions must be lowercase`,
                            vscode.DiagnosticSeverity.Error
                        );
                        diagnostics.push(range);
                    }
                }
            }
        }
    }

    /**
     * Enhanced: Perform basic type checking on variable assignments and function calls
     */
    private performTypeChecking(lines: string[], diagnostics: vscode.Diagnostic[]): void {
        const variableTypes = new Map<string, string>();
        
        // First pass: collect all type information
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Track variable declarations with explicit types (including generics)
            const varDeclMatch = line.match(/^\s*(?:var|let|const|final)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([a-zA-Z][a-zA-Z0-9_<>,\s|]*)/);
            if (varDeclMatch) {
                const varName = varDeclMatch[1];
                const varType = varDeclMatch[2].trim();
                variableTypes.set(varName, varType);
            }
            
            // Infer types from assignments (including constructor calls)
            const varAssignMatch = line.match(/^\s*(?:var|let|const|final)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)/);
            if (varAssignMatch && !variableTypes.has(varAssignMatch[1])) {
                const varName = varAssignMatch[1];
                const value = varAssignMatch[2].trim();
                
                // Check if it's a multi-line object literal
                let inferredType: string | undefined;
                if (value === '{' || value.endsWith('{')) {
                    inferredType = this.inferTypeFromLines(lines, i);
                } else {
                    inferredType = this.inferType(value);
                }
                
                if (inferredType) {
                    variableTypes.set(varName, inferredType);
                }
            }
            
            // Check for explicit type with constructor call - validate compatibility
            const explicitConstructorMatch = line.match(/^\s*(?:var|let|const|final)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([A-Z][a-zA-Z0-9_]*)\s*=\s*([A-Z][a-zA-Z0-9_]*)\s*\(/);
            if (explicitConstructorMatch) {
                const varName = explicitConstructorMatch[1];
                const explicitType = explicitConstructorMatch[2];
                const constructorType = explicitConstructorMatch[3];
                
                // Check if types are compatible
                if (!this.isTypeCompatible(explicitType, constructorType, lines)) {
                    const constructorIndex = line.indexOf(constructorType);
                    const range = new vscode.Range(i, constructorIndex, i, line.length);
                    diagnostics.push(
                        new vscode.Diagnostic(
                            range,
                            `Type mismatch: Cannot assign '${constructorType}' to variable of type '${explicitType}'. Classes are not compatible.`,
                            vscode.DiagnosticSeverity.Error
                        )
                    );
                }
            }
        }
        
        // Second pass: check for type errors
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Check type mismatches in assignments
            const reassignMatch = line.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)/);
            if (reassignMatch) {
                const varName = reassignMatch[1];
                const value = reassignMatch[2].trim();
                
                if (variableTypes.has(varName)) {
                    const expectedType = variableTypes.get(varName)!;
                    const actualType = this.inferType(value);
                    
                    if (actualType && !this.isTypeCompatible(expectedType, actualType, lines)) {
                        const varIndex = line.indexOf(varName);
                        const range = new vscode.Range(i, varIndex, i, line.length);
                        const severity = this.isUserDefinedClass(expectedType, lines) || this.isUserDefinedClass(actualType, lines)
                            ? vscode.DiagnosticSeverity.Error
                            : vscode.DiagnosticSeverity.Warning;
                        diagnostics.push(
                            new vscode.Diagnostic(
                                range,
                                `Type mismatch: Cannot assign '${actualType}' to variable of type '${expectedType}'`,
                                severity
                            )
                        );
                    }
                }
            }
            
            // Check for comparison with incompatible types
            const comparisonMatch = line.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*(==|!=|<|>|<=|>=)\s*([a-zA-Z_][a-zA-Z0-9_]*|"[^"]*"|'[^']*'|\d+\.?\d*)/);
            if (comparisonMatch) {
                const left = comparisonMatch[1];
                const right = comparisonMatch[3];
                
                if (variableTypes.has(left)) {
                    const leftType = variableTypes.get(left)!;
                    const rightType = this.inferType(right);
                    
                    if (rightType && !this.isTypeCompatible(leftType, rightType, lines) && !this.isTypeCompatible(rightType, leftType, lines)) {
                        const range = new vscode.Range(i, 0, i, line.length);
                        diagnostics.push(
                            new vscode.Diagnostic(
                                range,
                                `Comparing incompatible types: '${leftType}' and '${rightType}'`,
                                vscode.DiagnosticSeverity.Warning
                            )
                        );
                    }
                }
            }
            
            // Check for division by zero (skip comments)
            if (!line.trim().startsWith('//') && !line.trim().startsWith('/*')) {
                const divZeroMatch = line.match(/\/\s*(0)(?![\.0-9])/);
                if (divZeroMatch) {
                    const divIndex = line.indexOf(divZeroMatch[0]);
                    const range = new vscode.Range(i, divIndex, i, divIndex + divZeroMatch[0].length);
                    diagnostics.push(
                        new vscode.Diagnostic(
                            range,
                            'Division by zero will cause runtime error',
                            vscode.DiagnosticSeverity.Error
                        )
                    );
                }
            }
        }
    }

    /**
     * Enhanced: Detect unreachable code after return, break, continue, or throw
     */
    private detectUnreachableCode(lines: string[], diagnostics: vscode.Diagnostic[]): void {
        for (let i = 0; i < lines.length - 1; i++) {
            const line = lines[i].trim();
            
            // Check if line contains unconditional control flow statements
            if (line.match(/^\s*(return|break|continue|throw)\b/) && !line.includes('//')) {
                // Check next non-empty, non-comment line
                for (let j = i + 1; j < lines.length; j++) {
                    const nextLine = lines[j].trim();
                    
                    // Skip empty lines and comments
                    if (!nextLine || nextLine.startsWith('//') || nextLine.startsWith('/*')) {
                        continue;
                    }
                    
                    // If we find 'end', 'elif', 'else', 'catch', 'finally', it's not unreachable
                    if (nextLine.match(/^\s*(end|elif|else|catch|finally)\b/)) {
                        break;
                    }
                    
                    // Otherwise, this is unreachable code
                    const range = new vscode.Range(j, 0, j, lines[j].length);
                    diagnostics.push(
                        new vscode.Diagnostic(
                            range,
                            'Unreachable code detected',
                            vscode.DiagnosticSeverity.Warning
                        )
                    );
                    break;
                }
            }
        }
    }


    /**
     * Enhanced: Detect incorrect range operator (.. instead of ...)
     */
    private detectRangeOperatorErrors(lines: string[], diagnostics: vscode.Diagnostic[]): void {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (line.trim().startsWith('//')) {
                continue;
            }
            
            // Check for .. (two dots) which is not valid in Polyloft
            let rangeTwoDotsMatch;
            const rangeRegex = /(\d+)\.\.(\d+)/g;
            while ((rangeTwoDotsMatch = rangeRegex.exec(line)) !== null) {
                // Make sure it's not ... (three dots)
                const dotPosition = rangeTwoDotsMatch.index + rangeTwoDotsMatch[1].length;
                if (line[dotPosition + 2] !== '.') {
                    const range = new vscode.Range(i, dotPosition, i, dotPosition + 2);
                    diagnostics.push(
                        new vscode.Diagnostic(
                            range,
                            "Use '...' (three dots) for ranges, not '..' (two dots)",
                            vscode.DiagnosticSeverity.Error
                        )
                    );
                }
            }
        }
    }

    /**
     * Enhanced: Detect issues with string interpolation
     */
    private detectStringInterpolationIssues(lines: string[], diagnostics: vscode.Diagnostic[]): void {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (line.trim().startsWith('//')) {
                continue;
            }
            
            // Check for incorrect interpolation syntax (${} instead of #{})
            let wrongInterpMatch;
            const wrongInterpRegex = /\$\{[^}]+\}/g;
            while ((wrongInterpMatch = wrongInterpRegex.exec(line)) !== null) {
                const range = new vscode.Range(i, wrongInterpMatch.index, i, wrongInterpMatch.index + 2);
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        "Use '#{expression}' for string interpolation, not '${expression}'",
                        vscode.DiagnosticSeverity.Error
                    )
                );
            }
            
            // Warn about unescaped # in strings (might be intended interpolation)
            let stringMatch;
            const stringRegex = /"([^"]*#[^{][^"]*)"/g;
            while ((stringMatch = stringRegex.exec(line)) !== null) {
                // Find the position of # within the matched string
                const hashPos = stringMatch[1].indexOf('#');
                if (hashPos !== -1) {
                    const absoluteHashPos = stringMatch.index + 1 + hashPos;  // +1 for opening quote
                    const range = new vscode.Range(i, absoluteHashPos, i, absoluteHashPos + 1);
                    diagnostics.push(
                        new vscode.Diagnostic(
                            range,
                            "Did you mean to use string interpolation? Use '#{expression}' syntax",
                            vscode.DiagnosticSeverity.Hint
                        )
                    );
                }
            }
        }
    }

    /**
     * Infer the type from a value or expression
     */
    private inferType(value: string): string | undefined {
        value = value.trim();
        
        // Constructor call - infer type from class name
        const constructorMatch = value.match(/^([A-Z][a-zA-Z0-9_]*)\s*\(/);
        if (constructorMatch) {
            return constructorMatch[1];
        }
        
        // String literals
        if (value.match(/^["'].*["']$/)) {
            return 'String';
        }
        
        // Hexadecimal literals (0xFF, 0xABCD, etc.) -> Int
        if (value.match(/^0x[0-9a-fA-F]+$/)) {
            return 'Int';
        }
        
        // Binary literals (0b010101, etc.) -> Bytes
        if (value.match(/^0b[01]+$/)) {
            return 'Bytes';
        }
        
        // Numeric literals
        if (value.match(/^\d+$/)) {
            return 'Int';
        }
        if (value.match(/^\d+\.\d+$/)) {
            return 'Float';
        }
        
        // Boolean literals
        if (value === 'true' || value === 'false') {
            return 'Bool';
        }
        
        // Nil/null
        if (value === 'nil' || value === 'null') {
            return 'Any';  // nil can be any type
        }
        
        // Array literals with type inference
        if (value.match(/^\[.*\]$/)) {
            // Try to infer the element type
            const content = value.slice(1, -1).trim();
            if (content.length === 0) {
                return 'Array';
            }
            
            // Split by comma (simple approach, doesn't handle nested arrays)
            const elements = content.split(',').map(e => e.trim());
            if (elements.length > 0) {
                // Check if all elements are integers
                if (elements.every(e => e.match(/^\d+$/))) {
                    return 'Array<Int>';
                }
                // Check if all elements are floats
                if (elements.every(e => e.match(/^\d+\.\d+$/))) {
                    return 'Array<Float>';
                }
                // Check if all elements are strings
                if (elements.every(e => e.match(/^["'].*["']$/))) {
                    return 'Array<String>';
                }
                // Check if all elements are booleans
                if (elements.every(e => e === 'true' || e === 'false')) {
                    return 'Array<Bool>';
                }
            }
            
            return 'Array';
        }
        
        // Map literals - handle both single-line and multi-line maps
        if (value.match(/^\{/) && value.match(/\}$/)) {
            // Try to infer key-value types
            // For simple cases like { A: ["B"], C: [] }
            const keyValuePattern = /(\w+|\["[^"]*"\])\s*:\s*(\[[^\]]*\]|"[^"]*"|'[^']*'|\d+\.?\d*|\w+)/g;
            const matches = Array.from(value.matchAll(keyValuePattern));
            
            if (matches.length > 0) {
                let keyType: string | undefined;
                let valueType: string | undefined;
                
                for (const match of matches) {
                    const key = match[1];
                    const val = match[2];
                    
                    // Infer key type
                    const currentKeyType = key.match(/^["'].*["']$/) ? 'String' : 
                                          key.match(/^\d+$/) ? 'Int' : 'String';  // Default to String for identifiers
                    
                    // Infer value type
                    const currentValueType = this.inferType(val);
                    
                    // Set initial types
                    if (!keyType) keyType = currentKeyType;
                    if (!valueType) valueType = currentValueType;
                    
                    // Check for type consistency
                    if (keyType !== currentKeyType) keyType = 'Any';
                    if (valueType !== currentValueType) valueType = 'Any';
                }
                
                if (keyType && valueType) {
                    return `Map<${keyType}, ${valueType}>`;
                }
            }
            
            return 'Map';
        }
        
        return undefined;
    }

    /**
     * Infer type from a multi-line value (for handling multi-line objects/arrays)
     */
    private inferTypeFromLines(lines: string[], startLine: number): string | undefined {
        // Look for multi-line object literal starting with {
        const firstLine = lines[startLine].trim();
        if (!firstLine.match(/=\s*\{/)) {
            return undefined;
        }
        
        // Find the closing brace
        let bracketCount = 0;
        let endLine = startLine;
        let fullValue = '';
        
        for (let i = startLine; i < lines.length; i++) {
            const line = lines[i];
            fullValue += line;
            
            for (let j = 0; j < line.length; j++) {
                if (line[j] === '{') bracketCount++;
                if (line[j] === '}') bracketCount--;
            }
            
            if (bracketCount === 0 && i > startLine) {
                endLine = i;
                break;
            }
        }
        
        // Extract the value part after =
        const valueMatch = fullValue.match(/=\s*(\{[\s\S]*\})/);
        if (valueMatch) {
            return this.inferType(valueMatch[1].replace(/\s+/g, ' '));
        }
        
        return undefined;
    }

    /**
     * Check if two types are compatible for assignment
     */
    private isTypeCompatible(targetType: string, sourceType: string, lines?: string[]): boolean {
        // Exact match
        if (targetType === sourceType) {
            return true;
        }
        
        // Any can accept anything
        if (targetType === 'Any') {
            return true;
        }
        
        // Numeric promotions
        if (targetType === 'Float' && sourceType === 'Int') {
            return true;
        }
        if (targetType === 'Double' && (sourceType === 'Int' || sourceType === 'Float')) {
            return true;
        }
        
        // Check class inheritance if lines are provided
        if (lines) {
            const classHierarchy = this.buildClassHierarchy(lines);
            return this.isSubclass(sourceType, targetType, classHierarchy);
        }
        
        return false;
    }

    /**
     * Build class hierarchy map (class -> parent class)
     */
    private buildClassHierarchy(lines: string[]): Map<string, string> {
        const hierarchy = new Map<string, string>();
        
        for (const line of lines) {
            // Match class with inheritance: class Dog < Animal
            const classMatch = line.match(/^\s*(?:(?:public|private|protected|sealed|abstract)\s+)*class\s+([A-Z][a-zA-Z0-9_]*)\s*<\s*([A-Z][a-zA-Z0-9_]*)/);
            if (classMatch) {
                const className = classMatch[1];
                const parentClass = classMatch[2];
                hierarchy.set(className, parentClass);
            }
        }
        
        return hierarchy;
    }

    /**
     * Check if sourceClass is a subclass of targetClass
     */
    private isSubclass(sourceClass: string, targetClass: string, hierarchy: Map<string, string>): boolean {
        let currentClass = sourceClass;
        const visited = new Set<string>();
        
        while (currentClass) {
            // Prevent infinite loops - check before processing
            if (visited.has(currentClass)) {
                break;
            }
            visited.add(currentClass);
            
            if (currentClass === targetClass) {
                return true;
            }
            
            // Move up the hierarchy
            const parent = hierarchy.get(currentClass);
            if (!parent) {
                break;
            }
            currentClass = parent;
        }
        
        return false;
    }

    /**
     * Check if a type name is a user-defined class
     */
    private isUserDefinedClass(typeName: string, lines: string[]): boolean {
        // Check if class is defined in the document
        for (const line of lines) {
            const classMatch = line.match(/^\s*(?:(?:public|private|protected|sealed|abstract)\s+)*class\s+([A-Z][a-zA-Z0-9_]*)/);
            if (classMatch && classMatch[1] === typeName) {
                return true;
            }
        }
        return false;
    }

    private isInsideClassLikeStructure(lines: string[], currentLine: number): boolean {
        // Walk backwards to find enclosing structures
        let blockLevel = 0;
        let foundDefOrConstructor = false;
        let foundClassLike = false;
        let className = '';
        
        for (let i = currentLine - 1; i >= 0; i--) {
            const line = lines[i];
            
            // Track block nesting
            if (line.match(/^\s*end\s*$/)) {
                blockLevel++;
            }
            
            // Check for def (method) or constructor
            if (!foundDefOrConstructor && blockLevel === 0) {
                // Check for regular method (including private/public modifiers)
                if (line.match(/^\s*(?:(?:public|pub|private|priv|protected|prot|static)\s+)?def\s+/)) {
                    foundDefOrConstructor = true;
                    continue; // Keep looking for class/enum/record
                }
                // Check for constructor (ClassName(params):)
                const constructorMatch = line.match(/^\s*([A-Z][a-zA-Z0-9_]*)\s*\([^)]*\)\s*:\s*$/);
                if (constructorMatch) {
                    className = constructorMatch[1];
                    foundDefOrConstructor = true;
                    continue; // Keep looking for class/enum/record
                }
            }
            
            // Check for class, enum, or record
            const classLikeMatch = line.match(/^\s*(?:(?:public|pub|private|priv|protected|prot|sealed|abstract)\s+)*(class|enum|record)\s+([A-Z][a-zA-Z0-9_]*)/);
            if (classLikeMatch && blockLevel === 0) {
                foundClassLike = true;
                const foundClassName = classLikeMatch[2];
                // If we found a constructor, verify it matches this class/enum/record name
                if (className && className !== foundClassName) {
                    foundDefOrConstructor = false; // Constructor doesn't match, keep looking
                }
                if (foundDefOrConstructor) {
                    break;
                }
            }
            
            // Track block starts (going backwards, so these opened blocks)
            if (line.match(/^\s*(?:(?:public|pub|private|priv|protected|prot|static)\s+)?def\s+.*:\s*$/) ||
                line.match(/^\s*(if|elif|else|for|loop|try|catch|finally|class|enum|record)\b.*:\s*$/) || 
                line.match(/^\s*([A-Z][a-zA-Z0-9_]*)\s*\([^)]*\)\s*:\s*$/)) {
                blockLevel--;
                if (blockLevel < 0) {
                    // We've gone too far back
                    break;
                }
            }
        }
        
        // 'this' is valid if we're inside a method or constructor that's inside a class/enum/record
        return foundDefOrConstructor && foundClassLike;
    }

    private isInsideFunction(lines: string[], currentLine: number): boolean {
        let blockLevel = 0;
        for (let i = currentLine - 1; i >= 0; i--) {
            const line = lines[i];
            
            // Track end keywords (we're exiting a block going backwards, need to skip it)
            if (line.match(/^\s*end\b/)) {
                blockLevel++;
            }
            
            // Check for thread spawn do blocks (these are function-like contexts where return is valid)
            if (line.match(/thread\s+spawn\s+do/)) {
                if (blockLevel > 0) {
                    blockLevel--;
                } else {
                    // We're inside a thread spawn block, which allows return statements
                    return true;
                }
            }
            
            // Track block starts (including private/public modifiers)
            const blockStartMatch = line.match(/^\s*(?:(?:public|pub|private|priv|protected|prot|static)\s+)?(def|if|elif|else|for|loop|try|catch|finally)\b/);
            if (blockStartMatch) {
                if (blockLevel > 0) {
                    // We're exiting a block we were skipping
                    blockLevel--;
                } else {
                    // We're at the opening of a block we're currently inside
                    // Check if it's a def
                    if (blockStartMatch[1] === 'def') {
                        return true;
                    }
                    // Otherwise, we've reached a block boundary without finding a def
                    // This means we're inside this block (if/for/etc) but not inside a function
                    // Continue looking outside this block
                }
            }
            
            // Also check for constructor pattern (ClassName(params):)
            const constructorMatch = line.match(/^\s*([A-Z][a-zA-Z0-9_]*)\s*\([^)]*\)/);
            if (constructorMatch) {
                if (blockLevel > 0) {
                    blockLevel--;
                } else {
                    // We're inside a constructor, which is like a function
                    return true;
                }
            }
        }
        return false;
    }

    private isInsideLoop(lines: string[], currentLine: number): boolean {
        let blockLevel = 0;
        for (let i = currentLine - 1; i >= 0; i--) {
            const line = lines[i];
            
            // Track end keywords (we're exiting a block going backwards, need to skip it)
            if (line.match(/^\s*end\b/)) {
                blockLevel++;
            }
            
            // Check for loop start (for or loop)
            // Match both single-line and multi-line syntax
            if (line.match(/^\s*(for|loop)\b/)) {
                if (blockLevel > 0) {
                    // We're exiting a block we were skipping
                    blockLevel--;
                } else {
                    // We're at the opening of a loop we're currently inside
                    return true;
                }
            }
            
            // Track other block starts
            if (line.match(/^\s*(if|elif|else|def|try|catch|finally|class|enum|record)\b/) ||
                line.match(/^\s*do\b/)) {
                if (blockLevel > 0) {
                    blockLevel--;
                }
            }
        }
        return false;
    }

    private isSameScope(lines: string[], line1: number, line2: number): boolean {
        // Simple scope check - if both lines have same indentation level and no scope changes between them
        const indent1 = lines[line1].match(/^\s*/)?.[0].length || 0;
        const indent2 = lines[line2].match(/^\s*/)?.[0].length || 0;
        
        if (indent1 !== indent2) {
            return false;
        }

        // Check if there's a scope change between the two lines
        for (let i = line1 + 1; i < line2; i++) {
            const line = lines[i];
            if (line.match(/^\s*(def|class|interface|if|for|loop|try)\b.*:\s*$/)) {
                // New scope opened
                return false;
            }
        }

        return true;
    }

    /**
     * Enhanced: Validate for...where clause syntax
     */
    private validateForWhereClause(lines: string[], diagnostics: vscode.Diagnostic[]): void {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Check for for...where syntax
            const forWhereMatch = line.match(/^\s*for\s+(.+?)\s+in\s+(.+?)\s+where\s+(.+?):\s*(.*)$/);
            if (forWhereMatch) {
                const variable = forWhereMatch[1].trim();
                const collection = forWhereMatch[2].trim();
                const condition = forWhereMatch[3].trim();
                const afterColon = forWhereMatch[4].trim();
                
                // Validate that where condition is not empty
                if (!condition || condition.length === 0) {
                    const range = new vscode.Range(i, 0, i, line.length);
                    diagnostics.push(
                        new vscode.Diagnostic(
                            range,
                            'Where clause cannot be empty',
                            vscode.DiagnosticSeverity.Error
                        )
                    );
                }
                
                // Check for common mistakes like using 'and' instead of '&&' in where clause
                if (condition.match(/\band\b/)) {
                    const andIndex = line.indexOf(' and ');
                    if (andIndex !== -1) {
                        const range = new vscode.Range(i, andIndex, i, andIndex + 5);
                        diagnostics.push(
                            new vscode.Diagnostic(
                                range,
                                "Use '&&' instead of 'and' in where clause",
                                vscode.DiagnosticSeverity.Error
                            )
                        );
                    }
                }
            }
            
            // Check for incorrect 'where' usage (not in for loop)
            if (line.match(/^\s*where\s+/) && !line.match(/^\s*for\s+/)) {
                const range = new vscode.Range(i, 0, i, line.length);
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        "'where' keyword can only be used with 'for' loops",
                        vscode.DiagnosticSeverity.Error
                    )
                );
            }
        }
    }

    /**
     * Enhanced: Validate lambda/arrow function syntax
     */
    private validateLambdaSyntax(lines: string[], diagnostics: vscode.Diagnostic[]): void {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Check for lambda expressions: () => do ... end or () => expression
            const lambdaMatch = line.match(/\(([^)]*)\)\s*=>\s*(do\b|.+)/);
            if (lambdaMatch) {
                const body = lambdaMatch[2];
                
                // If it starts with 'do', it must have a corresponding 'end'
                if (body.trim() === 'do') {
                    let foundEnd = false;
                    for (let j = i + 1; j < lines.length; j++) {
                        if (lines[j].match(/^\s*end\s*$/)) {
                            foundEnd = true;
                            break;
                        }
                    }
                    
                    if (!foundEnd) {
                        const range = new vscode.Range(i, 0, i, line.length);
                        diagnostics.push(
                            new vscode.Diagnostic(
                                range,
                                "Lambda expression with 'do' requires corresponding 'end'",
                                vscode.DiagnosticSeverity.Warning
                            )
                        );
                    }
                }
            }
            
            // Check for incorrect lambda syntax using {} instead of do...end
            if (line.match(/=>\s*\{/)) {
                const braceIndex = line.indexOf('=>');
                const range = new vscode.Range(i, braceIndex, i, line.length);
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        "Use '=> do...end' for multi-line lambda expressions, not '=>{}'. Polyloft doesn't use braces for blocks",
                        vscode.DiagnosticSeverity.Error
                    )
                );
            }
        }
    }

    /**
     * Enhanced: Validate switch/case syntax
     */
    private validateSwitchCaseSyntax(lines: string[], diagnostics: vscode.Diagnostic[]): void {
        let inSwitch = false;
        let switchIndent = 0;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const indent = line.match(/^\s*/)?.[0].length || 0;
            
            // Check for switch statement
            if (line.match(/^\s*switch\s+/)) {
                inSwitch = true;
                switchIndent = indent;
            }
            
            // Check for end of switch
            if (inSwitch && line.match(/^\s*end\s*$/) && indent === switchIndent) {
                inSwitch = false;
            }
            
            // Check for case/default outside switch
            if (!inSwitch && line.match(/^\s*(case|default)\s*:/)) {
                const range = new vscode.Range(i, 0, i, line.length);
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        "'case' and 'default' can only be used inside 'switch' blocks",
                        vscode.DiagnosticSeverity.Error
                    )
                );
            }
            
            // Check for missing colon after case value
            const caseMatch = line.match(/^\s*case\s+([^:]+)$/);
            if (caseMatch && !line.includes(':')) {
                const range = new vscode.Range(i, 0, i, line.length);
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        "Case statement must end with colon (:)",
                        vscode.DiagnosticSeverity.Error
                    )
                );
            }
        }
    }

    /**
     * Validate import statements - check if imported files and symbols exist
     */
    private validateImports(document: vscode.TextDocument, lines: string[], diagnostics: vscode.Diagnostic[]): void {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!workspaceFolder) {
            return; // Can't validate without workspace context
        }

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Match import statements: import module.path { Symbol1, Symbol2 }
            const importMatch = line.match(/^\s*import\s+([a-zA-Z._\/]+)\s*\{([^}]+)\}/);
            if (importMatch) {
                const importPath = importMatch[1];
                const symbolsStr = importMatch[2];
                const symbols = symbolsStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
                
                // Try to resolve the import path
                const resolvedPath = this.resolveImportPath(workspaceFolder.uri.fsPath, importPath, document.uri.fsPath);
                
                if (!resolvedPath) {
                    // Import path not found
                    const pathStart = line.indexOf(importPath);
                    const range = new vscode.Range(i, pathStart, i, pathStart + importPath.length);
                    diagnostics.push(
                        new vscode.Diagnostic(
                            range,
                            `Cannot find module '${importPath}'. Make sure the file exists in libs/, src/, or relative to current file`,
                            vscode.DiagnosticSeverity.Error
                        )
                    );
                } else {
                    // File exists, now validate that symbols exist in the file
                    try {
                        const fileContent = fs.readFileSync(resolvedPath, 'utf8');
                        
                        // Find the start of the braces section to improve indexOf accuracy
                        const bracesStart = line.indexOf('{');
                        
                        for (const symbol of symbols) {
                            if (!this.symbolExistsInFile(fileContent, symbol)) {
                                // Search for symbol starting from the braces section
                                const symbolStart = bracesStart >= 0 ? 
                                    line.indexOf(symbol, bracesStart) : 
                                    line.indexOf(symbol);
                                    
                                if (symbolStart >= 0) {
                                    const range = new vscode.Range(i, symbolStart, i, symbolStart + symbol.length);
                                    diagnostics.push(
                                        new vscode.Diagnostic(
                                            range,
                                            `'${symbol}' is not exported from module '${importPath}'`,
                                            vscode.DiagnosticSeverity.Error
                                        )
                                    );
                                }
                            } else {
                                // Symbol exists, now check if import is allowed based on visibility
                                const symbolVisibility = this.getSymbolVisibility(fileContent, symbol);
                                
                                if (symbolVisibility) {
                                    const importCheck = this.canImportSymbol(
                                        document.uri.fsPath,
                                        resolvedPath,
                                        symbolVisibility
                                    );
                                    
                                    if (!importCheck.allowed) {
                                        const symbolStart = bracesStart >= 0 ? 
                                            line.indexOf(symbol, bracesStart) : 
                                            line.indexOf(symbol);
                                            
                                        if (symbolStart >= 0) {
                                            const range = new vscode.Range(i, symbolStart, i, symbolStart + symbol.length);
                                            diagnostics.push(
                                                new vscode.Diagnostic(
                                                    range,
                                                    `Cannot import '${symbol}': ${importCheck.reason}`,
                                                    vscode.DiagnosticSeverity.Error
                                                )
                                            );
                                        }
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        // Error reading file - log but don't show to user since the file existence was already verified
                        console.error(`Failed to read import file '${resolvedPath}':`, error);
                    }
                }
            }
        }
    }

    /**
     * Resolve import path to file system path (matching Polyloft interpreter logic)
     */
    private resolveImportPath(workspacePath: string, importPath: string, currentFilePath?: string): string | undefined {
        // Convert dot notation to path: math.vector -> math/vector
        const rel = importPath.replace(/\./g, '/');
        const possiblePaths: string[] = [];
        
        // If we have a current file context, try relative imports from current directory first
        if (currentFilePath) {
            const currentDir = path.dirname(currentFilePath);
            possiblePaths.push(
                path.join(currentDir, rel + '.pf'),                           // same directory: helper.pf
                path.join(currentDir, rel, 'index.pf'),                       // subdirectory with index
                path.join(currentDir, rel, path.basename(rel) + '.pf')        // subdirectory/subdirectory.pf
            );
        }
        
        // Standard library paths
        possiblePaths.push(
            // libs directory
            path.join(workspacePath, 'libs', rel + '.pf'),                    // libs/math/vector.pf (single file)
            path.join(workspacePath, 'libs', rel, 'index.pf'),                // libs/math/vector/index.pf (public API aggregator)
            path.join(workspacePath, 'libs', rel, path.basename(rel) + '.pf'), // libs/math/vector/vector.pf
            // src directory
            path.join(workspacePath, 'src', rel + '.pf'),
            path.join(workspacePath, 'src', rel, 'index.pf')
        );
        
        // Try global library paths (~/.polyloft/)
        const homeDir = process.env.HOME || process.env.USERPROFILE;
        if (homeDir) {
            const globalLib = path.join(homeDir, '.polyloft', 'libs');
            const globalSrc = path.join(homeDir, '.polyloft', 'src');
            
            possiblePaths.push(
                path.join(globalLib, rel + '.pf'),
                path.join(globalLib, rel, 'index.pf'),
                path.join(globalLib, rel, path.basename(rel) + '.pf'),
                path.join(globalSrc, rel + '.pf'),
                path.join(globalSrc, rel, 'index.pf')
            );
        }

        for (const filePath of possiblePaths) {
            if (fs.existsSync(filePath)) {
                return filePath;
            }
        }

        return undefined;
    }

    /**
     * Check if a symbol (class, function, enum, record, interface) exists in a file
     */
    private symbolExistsInFile(fileContent: string, symbol: string): boolean {
        // Escape special regex characters in symbol to prevent ReDoS attacks
        const escapedSymbol = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Check for class, enum, record, interface, or function definitions
        const patterns = [
            new RegExp(`(?:public\\s+|private\\s+|protected\\s+)?class\\s+${escapedSymbol}\\b`),
            new RegExp(`(?:public\\s+|private\\s+|protected\\s+)?enum\\s+${escapedSymbol}\\b`),
            new RegExp(`(?:public\\s+|private\\s+|protected\\s+)?record\\s+${escapedSymbol}\\b`),
            new RegExp(`(?:public\\s+|private\\s+|protected\\s+)?interface\\s+${escapedSymbol}\\b`),
            new RegExp(`def\\s+${escapedSymbol}\\s*\\(`),
            // Also check for const/var declarations (for exported constants)
            new RegExp(`(?:const|var|let)\\s+${escapedSymbol}\\b`),
        ];

        return patterns.some(pattern => pattern.test(fileContent));
    }

    /**
     * Get the visibility modifier of a symbol in a file
     * Returns 'public', 'private', 'protected', or undefined if not found
     */
    private getSymbolVisibility(fileContent: string, symbol: string): 'public' | 'private' | 'protected' | undefined {
        // Escape special regex characters in symbol to prevent ReDoS attacks
        const escapedSymbol = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Check for class, enum, record, interface with visibility modifiers
        const patterns = [
            { regex: new RegExp(`(public|private|protected)\\s+class\\s+${escapedSymbol}\\b`), type: 'class' },
            { regex: new RegExp(`(public|private|protected)\\s+enum\\s+${escapedSymbol}\\b`), type: 'enum' },
            { regex: new RegExp(`(public|private|protected)\\s+record\\s+${escapedSymbol}\\b`), type: 'record' },
            { regex: new RegExp(`(public|private|protected)\\s+interface\\s+${escapedSymbol}\\b`), type: 'interface' },
            // Functions with visibility modifiers
            { regex: new RegExp(`(public|private|protected)\\s+def\\s+${escapedSymbol}\\s*\\(`), type: 'function' },
            // Variables with visibility modifiers
            { regex: new RegExp(`(public|private|protected)\\s+(?:const|var|let)\\s+${escapedSymbol}\\b`), type: 'variable' },
            // Without explicit modifier - check for implicit public
            { regex: new RegExp(`^\\s*class\\s+${escapedSymbol}\\b`, 'm'), type: 'class', implicit: true },
            { regex: new RegExp(`^\\s*enum\\s+${escapedSymbol}\\b`, 'm'), type: 'enum', implicit: true },
            { regex: new RegExp(`^\\s*record\\s+${escapedSymbol}\\b`, 'm'), type: 'record', implicit: true },
            { regex: new RegExp(`^\\s*interface\\s+${escapedSymbol}\\b`, 'm'), type: 'interface', implicit: true },
            { regex: new RegExp(`^\\s*def\\s+${escapedSymbol}\\s*\\(`, 'm'), type: 'function', implicit: true },
            { regex: new RegExp(`^\\s*(?:const|var|let)\\s+${escapedSymbol}\\b`, 'm'), type: 'variable', implicit: true },
        ];

        for (const pattern of patterns) {
            const match = fileContent.match(pattern.regex);
            if (match) {
                if (pattern.implicit) {
                    // No explicit modifier means public by default
                    return 'public';
                }
                return match[1] as 'public' | 'private' | 'protected';
            }
        }

        return undefined;
    }

    /**
     * Check if an import is allowed based on visibility and folder structure
     * - public: can be imported from anywhere
     * - protected: can only be imported from the same folder
     * - private: cannot be imported
     */
    private canImportSymbol(
        importingFilePath: string,
        importedFilePath: string,
        symbolVisibility: 'public' | 'private' | 'protected'
    ): { allowed: boolean; reason?: string } {
        if (symbolVisibility === 'public') {
            return { allowed: true };
        }

        if (symbolVisibility === 'private') {
            return { 
                allowed: false, 
                reason: 'Private symbols cannot be imported' 
            };
        }

        if (symbolVisibility === 'protected') {
            // Protected: can only be imported from the same folder
            const importingDir = path.dirname(importingFilePath);
            const importedDir = path.dirname(importedFilePath);
            
            if (importingDir === importedDir) {
                return { allowed: true };
            }
            
            return { 
                allowed: false, 
                reason: 'Protected symbols can only be imported from the same folder' 
            };
        }

        return { allowed: true };
    }
}
