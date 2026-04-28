import { TreeSitterJavaLanguageHandler } from './handler';

const simpleClass = `public class App {
  private String name;

  public App(String name) {
    this.name = name;
  }

  public String getName() {
    return name;
  }
}`;

const withInterface = `public interface Greeter {
  String greet(String name);

  default String shout(String name) {
    return greet(name).toUpperCase();
  }
}`;

const withEnum = `public enum Status {
  ACTIVE,
  INACTIVE;

  public boolean isActive() {
    return this == ACTIVE;
  }
}`;

const withRecord = `public record Point(int x, int y) {
  public double distance() {
    return Math.sqrt(x * x + y * y);
  }
}`;

const withAnnotations = `public class Service {
  @Autowired
  private Repo repo;

  @Override
  public String toString() {
    return "Service";
  }

  @Deprecated
  public void oldMethod() {
    // legacy
  }
}`;

const innerClass = `public class Outer {
  private int value;

  public class Inner {
    public void show() {
      System.out.println(value);
    }
  }
}`;

const genericMethod = `public class Util {
  public <T> List<T> wrap(T item) {
    return List.of(item);
  }
}`;

const noDeclarations = `// just a comment
int x = 1;`;

const emptyFile = '';

const fourSpaceIndentedConstructor = `public class App {
    public App(String name) {
    }
}`;

const handler = new TreeSitterJavaLanguageHandler();

const findLineContaining = (content: string, needle: string): number =>
  Math.max(
    1,
    content.split('\n').findIndex(line => line.includes(needle)) + 1
  );

describe('TreeSitterJavaLanguageHandler', () => {
  describe('listBlocks', () => {
    it('lists class, constructor, and method blocks for a simple class', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/App.java',
        content: simpleClass,
      });

      expect(blocks).toHaveLength(3);
      expect(blocks[0]).toMatchObject({
        type: 'java_class',
        name: 'App',
        header: 'class App',
      });
      expect(blocks[1]).toMatchObject({
        type: 'java_method',
        name: 'App',
        header: 'method App()',
      });
      expect(blocks[2]).toMatchObject({
        type: 'java_method',
        name: 'getName',
        header: 'method getName()',
      });
    });

    it('includes default methods declared inside interfaces', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/Greeter.java',
        content: withInterface,
      });

      expect(blocks.map(block => block.name)).toEqual(
        expect.arrayContaining(['Greeter', 'shout'])
      );
      expect(blocks.find(block => block.name === 'Greeter')?.type).toBe(
        'java_interface'
      );
    });

    it('includes enum and enum methods', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/Status.java',
        content: withEnum,
      });

      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toMatchObject({
        type: 'java_enum',
        name: 'Status',
        header: 'enum Status',
      });
      expect(blocks[1]).toMatchObject({
        type: 'java_method',
        name: 'isActive',
      });
    });

    it('includes record and record methods', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/Point.java',
        content: withRecord,
      });

      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toMatchObject({
        type: 'java_record',
        name: 'Point',
        header: 'record Point',
      });
      expect(blocks[1]).toMatchObject({
        type: 'java_method',
        name: 'distance',
      });
    });

    it('includes nested class declarations and methods as separate blocks', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/Outer.java',
        content: innerClass,
      });

      expect(blocks).toHaveLength(3);
      expect(blocks.map(block => block.name)).toEqual(['Outer', 'Inner', 'show']);
      expect(blocks[1].type).toBe('java_class');
      expect(blocks[2].type).toBe('java_method');
    });

    it('captures generic methods', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/Util.java',
        content: genericMethod,
      });

      expect(blocks.map(block => block.name)).toEqual(['Util', 'wrap']);
      expect(blocks[1]).toMatchObject({
        type: 'java_method',
        header: 'method wrap()',
      });
    });

    it('returns no blocks for empty files', () => {
      expect(
        handler.listBlocks({
          filePath: '/workspace/Empty.java',
          content: emptyFile,
        })
      ).toEqual([]);
    });

    it('returns no blocks when there are no declarations', () => {
      expect(
        handler.listBlocks({
          filePath: '/workspace/NoDeclarations.java',
          content: noDeclarations,
        })
      ).toEqual([]);
    });
  });

  describe('findBlockAtLine', () => {
    it('finds class and innermost method blocks in simple class', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/App.java',
          content: simpleClass,
          line: 1,
        })
      ).toMatchObject({ name: 'App', type: 'java_class' });

      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/App.java',
          content: simpleClass,
          line: 5,
        })
      ).toMatchObject({ name: 'App', type: 'java_method' });

      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/App.java',
          content: simpleClass,
          line: 9,
        })
      ).toMatchObject({ name: 'getName', type: 'java_method' });

      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/App.java',
          content: simpleClass,
          line: 11,
        })
      ).toMatchObject({ name: 'App', type: 'java_class' });
    });

    it('returns innermost nested blocks in inner classes', () => {
      const showBodyLine = findLineContaining(innerClass, 'System.out.println');
      const innerDeclarationLine = findLineContaining(innerClass, 'class Inner');

      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/Outer.java',
          content: innerClass,
          line: showBodyLine,
        })
      ).toMatchObject({ name: 'show', type: 'java_method' });

      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/Outer.java',
          content: innerClass,
          line: innerDeclarationLine,
        })
      ).toMatchObject({ name: 'Inner', type: 'java_class' });
    });

    it('returns null for empty files', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/Empty.java',
          content: emptyFile,
          line: 1,
        })
      ).toBeNull();
    });
  });

  describe('findNearestBlock', () => {
    it('returns last block when line is past end of file', () => {
      const nearest = handler.findNearestBlock({
        filePath: '/workspace/App.java',
        content: simpleClass,
        line: simpleClass.split('\n').length + 20,
      });

      expect(nearest).toMatchObject({ name: 'getName', type: 'java_method' });
    });

    it('returns class block for field lines inside class scope', () => {
      const nearest = handler.findNearestBlock({
        filePath: '/workspace/App.java',
        content: simpleClass,
        line: 2,
      });

      expect(nearest).toMatchObject({ name: 'App', type: 'java_class' });
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    it('keeps line inside constructor body', () => {
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: simpleClass,
          suggestedLine: 5,
          fromFixOperation: false,
        })
      ).toBe(5);
    });

    it('keeps line inside method body', () => {
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: simpleClass,
          suggestedLine: 9,
          fromFixOperation: false,
        })
      ).toBe(9);
    });

    it('clamps to the last line when suggested line is past EOF', () => {
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: simpleClass,
          suggestedLine: simpleClass.split('\n').length + 1,
          fromFixOperation: true,
        })
      ).toBe(simpleClass.split('\n').length);
    });

    it('returns line 1 for empty content', () => {
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: emptyFile,
          suggestedLine: 42,
          fromFixOperation: false,
        })
      ).toBe(1);
    });

    it('uses annotation line as anchor when annotation starts declaration', () => {
      const overrideLine = findLineContaining(withAnnotations, '@Override');
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: withAnnotations,
          suggestedLine: overrideLine,
          fromFixOperation: false,
        })
      ).toBe(overrideLine);
    });
  });

  describe('buildDiagnosticRange', () => {
    it('starts at column 0 for non-indented class declarations', () => {
      const range = handler.buildDiagnosticRange({
        line1Based: findLineContaining(simpleClass, 'public class App {'),
        content: simpleClass,
      });

      expect(range.startChar).toBe(0);
      expect(range.endChar).toBeGreaterThanOrEqual('public class App'.length);
    });

    it('starts at column 2 for two-space indented method declarations', () => {
      const range = handler.buildDiagnosticRange({
        line1Based: findLineContaining(simpleClass, 'public String getName() {'),
        content: simpleClass,
      });

      expect(range.startChar).toBe(2);
    });

    it('starts at column 4 for four-space indented constructor declarations', () => {
      const range = handler.buildDiagnosticRange({
        line1Based: findLineContaining(
          fourSpaceIndentedConstructor,
          'public App(String name) {'
        ),
        content: fourSpaceIndentedConstructor,
      });

      expect(range.startChar).toBe(4);
    });
  });

  describe('detectLanguage', () => {
    it('detects .java files only', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/App.java',
          content: simpleClass,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/App.kt',
          content: '',
        })
      ).toBe(false);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/App.js',
          content: '',
        })
      ).toBe(false);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/App.java.bak',
          content: '',
        })
      ).toBe(false);
    });
  });

  describe('metadata', () => {
    it('uses java codeResourceType', () => {
      expect(handler.codeResourceType).toBe('java');
    });

    it('returns expected document info for Java source files', () => {
      expect(
        handler.getDocumentInfo({
          filePath: '/workspace/App.java',
          content: simpleClass,
        })
      ).toEqual({
        languageId: 'java',
        filePath: '/workspace/App.java',
        fileName: 'App.java',
        extension: '.java',
        isConfigLike: false,
        supportsBlocks: true,
      });
    });
  });
});
