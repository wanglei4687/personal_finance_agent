export type FinanceAirtableFieldConfig = {
  nameFieldId: string;
  amountFieldId?: string;
  dateFieldId?: string;
  categoryLinkFieldId?: string;
  totalFieldId?: string;
  budgetFieldId?: string;
  categoryLinksFieldId?: string;
  quarterFieldIds?: Record<1 | 2 | 3 | 4, string>;
};

export type FinanceAirtableTableConfig = {
  tableId: string;
  fields: FinanceAirtableFieldConfig;
};

export type FinanceAirtableBaseConfig = {
  baseId: string;
  year: number;
  supportsDatedPeriods: boolean;
  tables: {
    transactions: FinanceAirtableTableConfig;
    categories: FinanceAirtableTableConfig;
    budgets: FinanceAirtableTableConfig;
    incomeGroups: FinanceAirtableTableConfig;
    assets: FinanceAirtableTableConfig;
    liabilities: FinanceAirtableTableConfig;
  };
};

const TRANSACTION_SCHEMA_2026 = {
  tableId: 'tblgMwTbwQODsQwuv',
  fields: {
    nameFieldId: 'fldQ5zJ8JuVHCwJP0',
    amountFieldId: 'fldC9GkWpbxN4AwnQ',
    categoryLinkFieldId: 'flddUaparCLflxrMW',
    dateFieldId: 'fldqrWkygToqiowkc',
  },
} satisfies FinanceAirtableTableConfig;

const CATEGORY_SCHEMA = {
  tableId: 'tblKuLbZQGJByy0G2',
  fields: {
    nameFieldId: 'fldHx8iWT6i1JJR7x',
    totalFieldId: 'fld8Z69MzxBzNfifD',
  },
} satisfies FinanceAirtableTableConfig;

const BUDGET_SCHEMA = {
  tableId: 'tbllqk7PKlj6xrMqp',
  fields: {
    nameFieldId: 'fldSHO4ETwyi5aPVm',
    budgetFieldId: 'fldnzEa4DTsgFvLQk',
    categoryLinksFieldId: 'fldCyQVDiNZkJvRbY',
  },
} satisfies FinanceAirtableTableConfig;

const INCOME_GROUP_SCHEMA_2026 = {
  tableId: 'tblmcPX0N0Hmp82UE',
  fields: {
    nameFieldId: 'fldpi6BMdNKtqGOIe',
    categoryLinksFieldId: 'fldAWP51T5rFyfZW6',
    totalFieldId: 'fld9PoAwzzESFYlKe',
  },
} satisfies FinanceAirtableTableConfig;

const INCOME_GROUP_SCHEMA_2025 = {
  tableId: 'tbl1g6gZODgRJCeB1',
  fields: {
    nameFieldId: 'fldj1mol62oQADVsM',
    categoryLinksFieldId: 'flddGLD6r3Kx80Gh2',
    totalFieldId: 'fldr8WhEmwm2nQ62y',
  },
} satisfies FinanceAirtableTableConfig;

const ASSET_SCHEMA = {
  tableId: 'tbl6vUWEPR4ddshCT',
  fields: {
    nameFieldId: 'fldGYgTfHC54TAl04',
    quarterFieldIds: {
      1: 'fldeuBNSEMz3347df',
      2: 'fldOb1eVT2MLigQeG',
      3: 'fldLQqZtOXFGYGYjg',
      4: 'fld6gBuYvgtpqNf7n',
    },
  },
} satisfies FinanceAirtableTableConfig;

const LIABILITY_SCHEMA = {
  tableId: 'tbljK8cfg19L8WIQV',
  fields: {
    nameFieldId: 'fldi1IFoqLgHLVtDo',
    quarterFieldIds: {
      1: 'fldM7Wm3ZlT46Hurs',
      2: 'fldf8D00a68SqgVhF',
      3: 'fldQWMtFev4OpmwkZ',
      4: 'fldfxXJYEcF0G4Ax2',
    },
  },
} satisfies FinanceAirtableTableConfig;

const KNOWN_FINANCE_BASES: Record<number, FinanceAirtableBaseConfig> = {
  2025: {
    baseId: 'appTea0i0smnFzj97',
    year: 2025,
    supportsDatedPeriods: false,
    tables: {
      transactions: {
        ...TRANSACTION_SCHEMA_2026,
        fields: {
          ...TRANSACTION_SCHEMA_2026.fields,
          dateFieldId: undefined,
        },
      },
      categories: CATEGORY_SCHEMA,
      budgets: BUDGET_SCHEMA,
      incomeGroups: INCOME_GROUP_SCHEMA_2025,
      assets: ASSET_SCHEMA,
      liabilities: LIABILITY_SCHEMA,
    },
  },
  2026: {
    baseId: 'appYhYGdaiyNNDWdC',
    year: 2026,
    supportsDatedPeriods: true,
    tables: {
      transactions: TRANSACTION_SCHEMA_2026,
      categories: CATEGORY_SCHEMA,
      budgets: BUDGET_SCHEMA,
      incomeGroups: INCOME_GROUP_SCHEMA_2026,
      assets: ASSET_SCHEMA,
      liabilities: LIABILITY_SCHEMA,
    },
  },
};

export function getFinanceAirtableBaseConfig(
  year: number,
): FinanceAirtableBaseConfig {
  const envBaseId = process.env[`AIRTABLE_FINANCE_BASE_${year}`]?.trim();
  const knownConfig = KNOWN_FINANCE_BASES[year];

  if (knownConfig) {
    return envBaseId
      ? {
          ...knownConfig,
          baseId: envBaseId,
        }
      : knownConfig;
  }

  if (envBaseId) {
    return {
      ...KNOWN_FINANCE_BASES[2026],
      year,
      baseId: envBaseId,
    };
  }

  throw new Error(
    `No Airtable finance base configured for ${year}. Add AIRTABLE_FINANCE_BASE_${year} or extend finance-schema.ts.`,
  );
}
