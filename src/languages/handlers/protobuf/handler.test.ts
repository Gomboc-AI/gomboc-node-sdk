import { ProtobufLanguageHandler } from './handler';

const protoContent = [
  'syntax = "proto3";',
  '',
  'message User {',
  '  string id = 1;',
  '}',
  '',
  'service UserService {',
  '  rpc GetUser(GetUserRequest) returns (User);',
  '  rpc StreamUsers(StreamRequest) returns (stream User) {',
  '    option deprecated = true;',
  '  }',
  '}',
].join('\n');

describe('ProtobufLanguageHandler', () => {
  const handler = new ProtobufLanguageHandler();

  describe('detectLanguage', () => {
    it('detects .proto and rejects non-proto extensions', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/user.proto',
          content: protoContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/user.txt',
          content: protoContent,
        })
      ).toBe(false);
    });

    it('is extension-case insensitive', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/USER.PROTO',
          content: protoContent,
        })
      ).toBe(true);
    });
  });

  describe('getDocumentInfo', () => {
    it('returns protobuf document metadata', () => {
      expect(
        handler.getDocumentInfo({
          filePath: '/workspace/user.proto',
          content: protoContent,
        })
      ).toMatchObject({
        languageId: 'protobuf',
        fileName: 'user.proto',
        extension: '.proto',
        supportsBlocks: true,
        isConfigLike: false,
      });
    });
  });

  describe('listBlocks', () => {
    it('parses message, service, and rpc declarations', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/user.proto',
        content: protoContent,
      });
      expect(
        blocks.find(block => block.type === 'protobuf_message')?.name
      ).toBe('User');
      expect(
        blocks.find(block => block.type === 'protobuf_service')?.name
      ).toBe('UserService');
      expect(blocks.find(block => block.type === 'protobuf_rpc')?.name).toBe(
        'GetUser'
      );
      expect(blocks.find(block => block.type === 'protobuf_rpc')?.endLine).toBe(
        8
      );
    });

    it('parses enum and rpc-with-body ranges', () => {
      const content = [
        'enum Role {',
        '  ADMIN = 0;',
        '}',
        'service Api {',
        '  rpc Ping(PingRequest) returns (PingResponse) {',
        '    option idempotency_level = NO_SIDE_EFFECTS;',
        '  }',
        '}',
      ].join('\n');
      const blocks = handler.listBlocks({
        filePath: '/workspace/api.proto',
        content,
      });
      expect(blocks.find(block => block.type === 'protobuf_enum')?.name).toBe(
        'Role'
      );
      expect(
        blocks.find(
          block => block.type === 'protobuf_rpc' && block.name === 'Ping'
        )?.endLine
      ).toBe(7);
    });

    it('returns empty for empty files and files with no parseable blocks', () => {
      expect(
        handler.listBlocks({ filePath: '/workspace/user.proto', content: '' })
      ).toEqual([]);
      expect(
        handler.listBlocks({
          filePath: '/workspace/user.proto',
          content: 'syntax = "proto3";',
        })
      ).toEqual([]);
    });
  });

  describe('findBlockAtLine', () => {
    it('returns innermost block and null in gaps', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/user.proto',
          content: protoContent,
          line: 10,
        })?.name
      ).toBe('StreamUsers');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/user.proto',
          content: protoContent,
          line: 2,
        })
      ).toBeNull();
    });

    it('treats non-positive line values as line 1', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/user.proto',
          content: protoContent,
          line: 0,
        })
      ).toBeNull();
    });
  });

  describe('findNearestBlock', () => {
    it('returns first, previous, and last blocks as expected', () => {
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/user.proto',
          content: protoContent,
          line: 1,
        })?.name
      ).toBe('User');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/user.proto',
          content: protoContent,
          line: 6,
        })?.name
      ).toBe('User');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/user.proto',
          content: protoContent,
          line: 999,
        })?.name
      ).toBe('StreamUsers');
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      'message User {',
      '  string id = 1;',
      '}',
      '',
      '// trailing comment',
    ].join('\n');

    it('covers fix-operation, weak-line fallback, and invalid inputs', () => {
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: anchorContent,
          suggestedLine: 2,
          fromFixOperation: true,
        })
      ).toEqual({ line: 2, character: 2 });
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: anchorContent,
          suggestedLine: 999,
          fromFixOperation: true,
        })
      ).toEqual({ line: 5, character: 0 });
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: anchorContent,
          suggestedLine: 3,
          fromFixOperation: false,
        })
      ).toEqual({ line: 2, character: 2 });
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: anchorContent,
          suggestedLine: 0,
          fromFixOperation: false,
        })
      ).toEqual({ line: 1, character: 0 });
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: anchorContent,
          suggestedLine: -5,
          fromFixOperation: false,
        })
      ).toEqual({ line: 1, character: 0 });
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: anchorContent,
          suggestedLine: Number.NaN,
          fromFixOperation: false,
        })
      ).toEqual({ line: 1, character: 0 });
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: anchorContent,
          suggestedLine: 3.9,
          fromFixOperation: true,
        })
      ).toEqual({ line: 3, character: 0 });
    });

    it('handles empty and undefined content safely', () => {
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: '',
          suggestedLine: 99,
          fromFixOperation: true,
        })
      ).toEqual({ line: 1, character: 0 });
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: undefined as unknown as string,
          suggestedLine: 5,
          fromFixOperation: true,
        })
      ).toEqual({ line: 1, character: 0 });
    });
  });
});
