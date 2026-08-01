import { describe, expect, it } from 'vitest';
import {
    filterPathSuggestions,
    getDirectoryPathSuggestions,
    getPathAutocompleteRequest,
} from './newSessionPathAutocomplete';

describe('new-session path autocomplete', () => {
    it('queries the containing directory for a partial home-relative path', () => {
        expect(getPathAutocompleteRequest('~/projects/hap', '/home/user')).toEqual({
            queryPath: '/home/user/projects/',
            parentDisplay: '~/projects/',
            prefix: 'hap',
        });
    });

    it('queries the home directory for a single path segment', () => {
        expect(getPathAutocompleteRequest('pro', '/home/user')).toEqual({
            queryPath: '/home/user/',
            parentDisplay: '~/',
            prefix: 'pro',
        });
    });

    it('preserves Windows drive paths', () => {
        expect(getPathAutocompleteRequest('C:\\Users\\me\\pro', 'C:\\Users\\me')).toEqual({
            queryPath: 'C:\\Users\\me\\',
            parentDisplay: 'C:\\Users\\me\\',
            prefix: 'pro',
        });
    });

    it('returns only matching directories in stable alphabetical order', () => {
        const request = getPathAutocompleteRequest('~/pro', '/home/user')!;
        expect(getDirectoryPathSuggestions(request, [
            { name: 'projects', type: 'directory' },
            { name: 'profile.txt', type: 'file' },
            { name: 'Production', type: 'directory' },
            { name: 'src', type: 'directory' },
        ])).toEqual([
            { key: '~/Production', label: '~/Production', subtitle: 'on machine' },
            { key: '~/projects', label: '~/projects', subtitle: 'on machine' },
        ]);
    });

    it('filters history while deduplicating absolute and home-relative paths', () => {
        const normalize = (path: string, homeDir?: string) => path.replace('~', homeDir ?? '~');
        expect(filterPathSuggestions('~/hap', '/home/user', [
            { key: '~/happy', label: '~/happy' },
            { key: '/home/user/happy', label: '/home/user/happy' },
            { key: '~/other', label: '~/other' },
        ], normalize)).toEqual([
            { key: '~/happy', label: '~/happy' },
        ]);
    });
});
