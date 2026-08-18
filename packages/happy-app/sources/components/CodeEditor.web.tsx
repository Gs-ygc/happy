import * as React from 'react';
import CodeMirror from '@uiw/react-codemirror';
import type { Extension } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { yaml } from '@codemirror/lang-yaml';
import { python } from '@codemirror/lang-python';
import { go } from '@codemirror/lang-go';
import { rust } from '@codemirror/lang-rust';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { sql } from '@codemirror/lang-sql';
import { xml } from '@codemirror/lang-xml';
import { shouldEnableSyntaxHighlighting } from './codeEditorPolicy';

interface CodeEditorProps {
    value: string;
    onChange: (value: string) => void;
    language: string | null;
    darkMode: boolean;
    readOnly?: boolean;
}

function getLanguageExtension(language: string | null): Extension | null {
    switch (language) {
        case 'javascript': case 'jsx': return javascript({ jsx: true });
        case 'typescript': case 'tsx': return javascript({ typescript: true, jsx: language === 'tsx' });
        case 'css': return css();
        case 'html': return html();
        case 'json': return json();
        case 'markdown': return markdown();
        case 'yaml': return yaml();
        case 'python': return python();
        case 'go': return go();
        case 'rust': return rust();
        case 'java': return java();
        case 'c': case 'cpp': return cpp();
        case 'sql': return sql();
        case 'xml': return xml();
        default: return null;
    }
}

export const CodeEditor = React.memo(function CodeEditor({ value, onChange, language, darkMode, readOnly = false }: CodeEditorProps) {
    const highlightingEnabled = shouldEnableSyntaxHighlighting(value.length);
    const extensions = React.useMemo(() => {
        if (!highlightingEnabled) return [];
        const languageExtension = getLanguageExtension(language);
        return languageExtension ? [languageExtension] : [];
    }, [language, highlightingEnabled]);

    return (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', backgroundColor: 'transparent' }}>
            <CodeMirror
                value={value}
                onChange={readOnly ? undefined : onChange}
                extensions={extensions}
                theme={darkMode ? 'dark' : 'light'}
                editable={!readOnly}
                readOnly={readOnly}
                basicSetup={{ foldGutter: highlightingEnabled, autocompletion: highlightingEnabled }}
                style={{ minHeight: '100%', fontSize: 14 }}
            />
        </div>
    );
});
