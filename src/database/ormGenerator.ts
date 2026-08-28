import { ColumnInfo, ForeignKeyInfo } from '../common/messages';

export class OrmGenerator {
  public static toPascalCase(str: string): string {
    return str
      .replace(/(?:^\w|[A-Z]|\b\w)/g, (letter) => letter.toUpperCase())
      .replace(/[\s\-_]+/g, '');
  }

  public static toCamelCase(str: string): string {
    const pascal = OrmGenerator.toPascalCase(str);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
  }

  // 1. PRISMA SCHEMA
  public static toPrisma(
    tableName: string,
    columns: ColumnInfo[],
    foreignKeys: ForeignKeyInfo[]
  ): string {
    const modelName = OrmGenerator.toPascalCase(tableName);
    const fields: string[] = [];

    for (const col of columns) {
      let prismaType = 'String';
      const colType = col.type.toUpperCase();

      if (colType.includes('INT')) {
        prismaType = 'Int';
      } else if (colType.includes('REAL') || colType.includes('FLOA') || colType.includes('DOUB')) {
        prismaType = 'Float';
      } else if (colType.includes('BOOL')) {
        prismaType = 'Boolean';
      } else if (colType.includes('TIME') || colType.includes('DATE')) {
        prismaType = 'DateTime';
      } else if (colType.includes('BLOB')) {
        prismaType = 'Bytes';
      }

      const isOptional = !col.notnull && col.pk === 0;
      const typeStr = `${prismaType}${isOptional ? '?' : ''}`;

      const attributes: string[] = [];
      if (col.pk > 0) {
        attributes.push('@id');
        if (prismaType === 'Int') {
          attributes.push('@default(autoincrement())');
        }
      }

      const fk = foreignKeys.find((f) => f.from === col.name);
      if (fk) {
        const relationModel = OrmGenerator.toPascalCase(fk.table);
        const relationFieldName = OrmGenerator.toCamelCase(fk.table);
        fields.push(`  ${col.name.padEnd(16)} ${typeStr.padEnd(10)} ${attributes.join(' ')}`);
        fields.push(
          `  ${relationFieldName.padEnd(16)} ${relationModel}${isOptional ? '?' : ''} @relation(fields: [${col.name}], references: [${fk.to}])`
        );
        continue;
      }

      fields.push(`  ${col.name.padEnd(16)} ${typeStr.padEnd(10)} ${attributes.join(' ')}`);
    }

    const queryExample = `
// Example Prisma Queries:
// const items = await prisma.${OrmGenerator.toCamelCase(tableName)}.findMany({ take: 20 });
// const newItem = await prisma.${OrmGenerator.toCamelCase(tableName)}.create({ data: { ... } });`;

    return `model ${modelName} {\n${fields.join('\n')}\n}\n${queryExample}`;
  }

  // 2. DRIZZLE ORM
  public static toDrizzle(
    tableName: string,
    columns: ColumnInfo[],
    foreignKeys: ForeignKeyInfo[]
  ): string {
    const varName = OrmGenerator.toCamelCase(tableName);
    const imports = new Set<string>(['sqliteTable']);
    const fieldDefs: string[] = [];

    for (const col of columns) {
      const colType = col.type.toUpperCase();
      let drizzleType = 'text';

      if (colType.includes('INT')) {
        drizzleType = 'integer';
        imports.add('integer');
      } else if (colType.includes('REAL') || colType.includes('FLOA') || colType.includes('DOUB')) {
        drizzleType = 'real';
        imports.add('real');
      } else if (colType.includes('BLOB')) {
        drizzleType = 'blob';
        imports.add('blob');
      } else {
        imports.add('text');
      }

      let def = `${col.name}: ${drizzleType}('${col.name}')`;

      if (col.pk > 0) {
        if (drizzleType === 'integer') {
          def += '.primaryKey({ autoIncrement: true })';
        } else {
          def += '.primaryKey()';
        }
      }

      if (col.notnull) {
        def += '.notNull()';
      }

      const fk = foreignKeys.find((f) => f.from === col.name);
      if (fk) {
        def += `.references(() => ${OrmGenerator.toCamelCase(fk.table)}.${fk.to})`;
      }

      fieldDefs.push(`  ${def},`);
    }

    const importStatement = `import { ${Array.from(imports).join(', ')} } from 'drizzle-orm/sqlite-core';`;

    const queryExample = `
// Example Drizzle Queries:
// const result = await db.select().from(${varName}).limit(20);
// await db.insert(${varName}).values({ ... });`;

    return `${importStatement}\n\nexport const ${varName} = sqliteTable('${tableName}', {\n${fieldDefs.join('\n')}\n});\n${queryExample}`;
  }

  // 3. TYPESCRIPT & ZOD SCHEMA
  public static toZod(tableName: string, columns: ColumnInfo[]): string {
    const typeName = OrmGenerator.toPascalCase(tableName);
    const zodFields: string[] = [];
    const tsFields: string[] = [];

    for (const col of columns) {
      const colType = col.type.toUpperCase();
      let zodType = 'z.string()';
      let tsType = 'string';

      if (colType.includes('INT')) {
        zodType = 'z.number().int()';
        tsType = 'number';
      } else if (colType.includes('REAL') || colType.includes('FLOA') || colType.includes('DOUB')) {
        zodType = 'z.number()';
        tsType = 'number';
      } else if (colType.includes('BOOL')) {
        zodType = 'z.boolean()';
        tsType = 'boolean';
      } else if (colType.includes('BLOB')) {
        zodType = 'z.instanceof(Uint8Array)';
        tsType = 'Uint8Array';
      }

      if (col.name.toLowerCase().includes('email')) {
        zodType = 'z.string().email()';
      } else if (col.name.toLowerCase().includes('uuid')) {
        zodType = 'z.string().uuid()';
      }

      if (!col.notnull && col.pk === 0) {
        zodType += '.nullable()';
        tsType += ' | null';
      }

      zodFields.push(`  ${col.name}: ${zodType},`);
      tsFields.push(`  ${col.name}: ${tsType};`);
    }

    return `import { z } from 'zod';

export const ${typeName}Schema = z.object({
${zodFields.join('\n')}
});

export type ${typeName} = z.infer<typeof ${typeName}Schema>;

export interface I${typeName} {
${tsFields.join('\n')}
}`;
  }

  // 4. PYTHON SQLALCHEMY & DATACLASS
  public static toPython(tableName: string, columns: ColumnInfo[]): string {
    const className = OrmGenerator.toPascalCase(tableName);
    const saFields: string[] = [];
    const dcFields: string[] = [];

    for (const col of columns) {
      const colType = col.type.toUpperCase();
      let saType = 'String';
      let pyType = 'str';

      if (colType.includes('INT')) {
        saType = 'Integer';
        pyType = 'int';
      } else if (colType.includes('REAL') || colType.includes('FLOA') || colType.includes('DOUB')) {
        saType = 'Float';
        pyType = 'float';
      } else if (colType.includes('BOOL')) {
        saType = 'Boolean';
        pyType = 'bool';
      } else if (colType.includes('TIME') || colType.includes('DATE')) {
        saType = 'DateTime';
        pyType = 'datetime';
      } else if (colType.includes('BLOB')) {
        saType = 'LargeBinary';
        pyType = 'bytes';
      }

      const isOptional = !col.notnull && col.pk === 0;
      const pyFinalType = isOptional ? `Optional[${pyType}] = None` : pyType;

      const saAttrs = [`${saType}`];
      if (col.pk > 0) {saAttrs.push('primary_key=True');}
      if (col.notnull) {saAttrs.push('nullable=False');}

      saFields.push(`    ${col.name} = Column(${saAttrs.join(', ')})`);
      dcFields.push(`    ${col.name}: ${pyFinalType}`);
    }

    return `from dataclasses import dataclass
from typing import Optional
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, LargeBinary
from sqlalchemy.orm import declarative_base

Base = declarative_base()

class ${className}(Base):
    __tablename__ = "${tableName}"

${saFields.join('\n')}

@dataclass
class ${className}Record:
${dcFields.join('\n')}`;
  }

  // 5. GO STRUCT
  public static toGolang(tableName: string, columns: ColumnInfo[]): string {
    const structName = OrmGenerator.toPascalCase(tableName);
    const fields: string[] = [];

    for (const col of columns) {
      const colType = col.type.toUpperCase();
      let goType = 'string';

      if (colType.includes('INT')) {
        goType = 'int64';
      } else if (colType.includes('REAL') || colType.includes('FLOA') || colType.includes('DOUB')) {
        goType = 'float64';
      } else if (colType.includes('BOOL')) {
        goType = 'bool';
      } else if (colType.includes('BLOB')) {
        goType = '[]byte';
      } else if (colType.includes('TIME') || colType.includes('DATE')) {
        goType = 'time.Time';
      }

      if (!col.notnull && col.pk === 0 && goType !== '[]byte') {
        goType = `*${goType}`;
      }

      const goFieldName = OrmGenerator.toPascalCase(col.name);
      fields.push(`\t${goFieldName.padEnd(16)} ${goType.padEnd(12)} \`json:"${col.name}" db:"${col.name}"\``);
    }

    return `package models

import "time"

type ${structName} struct {
${fields.join('\n')}
}`;
  }
}
