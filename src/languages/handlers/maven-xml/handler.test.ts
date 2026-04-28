import { MavenXmlLanguageHandler } from './handler';

const mavenXml = [
  '<project>',
  '  <groupId>com.example</groupId>',
  '  <artifactId>service</artifactId>',
  '  <dependencies>',
  '    <dependency>',
  '      <groupId>org.slf4j</groupId>',
  '      <artifactId>slf4j-api</artifactId>',
  '    </dependency>',
  '  </dependencies>',
  '</project>',
].join('\n');

describe('MavenXMLLanguageHandler', () => {
  const handler = new MavenXmlLanguageHandler();

  it('returns maven xml document info metadata', () => {
    expect(
      handler.getDocumentInfo({
        filePath: '/workspace/pom.xml',
        content: mavenXml,
      })
    ).toMatchObject({
      languageId: 'maven-xml',
      fileName: 'pom.xml',
      extension: '.xml',
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      '<project>',
      '  <dependencies>',
      '  </dependencies>',
      '</project>',
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
      ).toEqual({ line: 3, character: 2 });
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
    it('parses dependency + project blocks with stable headers', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/pom.xml',
        content: mavenXml,
      });
      expect(
        blocks.find(block => block.type === 'maven_dependency')?.name
      ).toBe('org.slf4j:slf4j-api');
      expect(
        blocks.find(block => block.type === 'maven_project')?.header
      ).toContain('com.example:service');
    });

    it('returns project-only block when no dependency exists', () => {
      const content = [
        '<project>',
        '  <groupId>com.example</groupId>',
        '  <artifactId>app</artifactId>',
        '</project>',
      ].join('\n');
      const blocks = handler.listBlocks({
        filePath: '/workspace/pom.xml',
        content,
      });
      expect(
        blocks.filter(block => block.type === 'maven_dependency')
      ).toHaveLength(0);
      expect(
        blocks.filter(block => block.type === 'maven_project')
      ).toHaveLength(1);
    });

    it('parses multiple dependency blocks and fallback names', () => {
      const content = [
        '<project>',
        '  <groupId>com.example</groupId>',
        '  <artifactId>app</artifactId>',
        '  <dependencies>',
        '    <dependency>',
        '      <groupId>org.slf4j</groupId>',
        '      <artifactId>slf4j-api</artifactId>',
        '    </dependency>',
        '    <dependency>',
        '      <artifactId>only-artifact</artifactId>',
        '    </dependency>',
        '    <dependency>',
        '      <groupId>only.group</groupId>',
        '    </dependency>',
        '    <dependency>',
        '    </dependency>',
        '  </dependencies>',
        '</project>',
      ].join('\n');
      const blocks = handler.listBlocks({
        filePath: '/workspace/pom.xml',
        content,
      });
      const deps = blocks.filter(block => block.type === 'maven_dependency');
      expect(deps).toHaveLength(4);
      expect(deps[0].name).toBe('org.slf4j:slf4j-api');
      expect(deps[1].name).toBe('only-artifact');
      expect(deps[2].name).toBe('only.group');
      expect(deps[3].name).toMatch(/^dependency@/);
    });
  });

  describe('findBlockAtLine and project priority', () => {
    it('returns first containing block for dependency lines', () => {
      const block = handler.findBlockAtLine({
        filePath: '/workspace/pom.xml',
        content: mavenXml,
        line: 9,
      });
      expect(block?.type).toBe('maven_project');
    });

    it('project block spans first through last file line', () => {
      const project = handler
        .listBlocks({ filePath: '/workspace/pom.xml', content: mavenXml })
        .find(block => block.type === 'maven_project');
      expect(project?.startLine).toBe(1);
      expect(project?.endLine).toBe(mavenXml.split('\n').length);
    });
  });

  describe('describeBlock', () => {
    it('returns maven_project fallback when no block is found', () => {
      const content = '';
      expect(
        handler.describeBlock({
          filePath: '/workspace/pom.xml',
          content,
          line: 42,
        })
      ).toEqual({
        blockType: 'maven_project',
        blockName: 'pom.xml',
        blockStartLine: 0,
        blockEndLine: content.split('\n').length - 1,
      });
    });
  });
});
