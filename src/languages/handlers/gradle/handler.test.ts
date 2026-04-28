import { GradleLanguageHandler } from './handler';

const gradleContent = [
  'plugins {',
  '  id "java"',
  '}',
  '',
  'task smokeTest {',
  '  doLast {',
  '    println "ok"',
  '  }',
  '}',
].join('\n');

describe('GradleLanguageHandler', () => {
  const handler = new GradleLanguageHandler();

  it('returns gradle document info metadata', () => {
    expect(
      handler.getDocumentInfo({
        filePath: '/workspace/build.gradle',
        content: gradleContent,
      })
    ).toMatchObject({
      languageId: 'gradle',
      extension: '.gradle',
      supportsBlocks: true,
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      'task smokeTest {',
      '  doLast {',
      '  }',
      '}',
      '',
    ].join('\n');

    it('covers all base anchor edge cases', () => {
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
          suggestedLine: 4,
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
      ).toEqual({ line: 3, character: 2 });
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

  describe('listBlocks', () => {
    it('parses common gradle task and block patterns', () => {
      const content = [
        'dependencies {',
        '  implementation "a:b:1.0"',
        '}',
        '',
        'task smokeTest {',
        '  doLast {',
        '    println "ok"',
        '  }',
        '}',
        '',
        'tasks.register("lint") {',
        '  doLast {',
        '    println "lint"',
        '  }',
        '}',
        '',
        'tasks.create("publishLocal") {',
        '  doLast {',
        '    println "pub"',
        '  }',
        '}',
      ].join('\n');

      const blocks = handler.listBlocks({
        filePath: '/workspace/build.gradle',
        content,
      });
      expect(
        blocks.find(
          block =>
            block.type === 'gradle_block' && block.name === 'dependencies'
        )
      ).toBeDefined();
      expect(
        blocks.find(
          block => block.type === 'gradle_task' && block.name === 'smokeTest'
        )
      ).toBeDefined();
      expect(
        blocks.find(
          block => block.type === 'gradle_task' && block.name === 'lint'
        )
      ).toBeDefined();
      expect(
        blocks.find(
          block => block.type === 'gradle_task' && block.name === 'publishLocal'
        )
      ).toBeDefined();
      expect(
        blocks.find(block => block.type === 'gradle_project')
      ).toBeDefined();
    });

    it('returns project block spanning whole file', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/build.gradle',
        content: gradleContent,
      });
      const project = blocks.find(block => block.type === 'gradle_project');
      expect(project?.startLine).toBe(1);
      expect(project?.endLine).toBe(gradleContent.split('\n').length);
    });

    it('surfaces nested doLast as a generic gradle_block', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/build.gradle',
        content: gradleContent,
      });
      expect(
        blocks.find(
          block => block.type === 'gradle_block' && block.name === 'doLast'
        )
      ).toBeDefined();
    });
  });

  describe('findBlockAtLine and findNearestBlock', () => {
    it('returns first containing block for nested doLast lines', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/build.gradle',
          content: gradleContent,
          line: 7,
        })?.name
      ).toBe('build.gradle');
    });

    it('returns nearest last block for lines past end', () => {
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/build.gradle',
          content: gradleContent,
          line: 999,
        })?.type
      ).toBe('gradle_block');
    });
  });

  describe('describeBlock', () => {
    it('falls back to gradle_project when no block can be found', () => {
      const content = '';
      const result = handler.describeBlock({
        filePath: '/workspace/build.gradle',
        content,
        line: 100,
      });
      expect(result).toEqual({
        blockType: 'gradle_project',
        blockName: 'build.gradle',
        blockStartLine: 0,
        blockEndLine: content.split('\n').length - 1,
      });
    });
  });
});
