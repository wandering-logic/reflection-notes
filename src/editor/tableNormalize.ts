import { Fragment, Node, Slice, type Schema } from "prosemirror-model";

/**
 * Normalize a table node to enforce GFM table semantics:
 * 1. Flatten spanning cells (colspan/rowspan > 1 → split into 1x1)
 * 2. Ensure first row cells are `table_header`, others are `table_cell`
 *
 * Row length normalization is handled by prosemirror-tables' tableEditing plugin.
 */
export function normalizeTableNode(table: Node, schema: Schema): Node {
  if (table.type.name !== "table") {
    return table;
  }

  const tableType = schema.nodes.table;
  const rowType = schema.nodes.table_row;
  const cellType = schema.nodes.table_cell;
  const headerType = schema.nodes.table_header;

  const normalizedRows: Node[] = [];

  table.forEach((row, _offset, rowIndex) => {
    if (row.type.name !== "table_row") {
      return;
    }

    const normalizedCells: Node[] = [];
    const isHeaderRow = rowIndex === 0;
    const targetCellType = isHeaderRow ? headerType : cellType;

    row.forEach((cell) => {
      // Get colspan (default to 1)
      // Note: rowspan is reset to 1 below but not expanded into subsequent rows
      const colspan = (cell.attrs.colspan as number) || 1;

      // Flatten: create one cell for each spanned position
      // For MVP, we only handle colspan (rowspan requires more complex logic)
      for (let i = 0; i < colspan; i++) {
        // For first cell, keep content; for spanned cells, empty
        const content = i === 0 ? cell.content : Fragment.empty;

        // Create cell with correct type and reset colspan/rowspan to 1
        const newCell = targetCellType.create(
          {
            ...cell.attrs,
            colspan: 1,
            rowspan: 1,
          },
          content,
        );
        normalizedCells.push(newCell);
      }

      // Note: rowspan is not fully handled - we'd need to track which cells
      // span into subsequent rows. For MVP, we just reset rowspan to 1.
      // The prosemirror-tables fixTables will handle any resulting issues.
    });

    const normalizedRow = rowType.create(null, normalizedCells);
    normalizedRows.push(normalizedRow);
  });

  return tableType.create(table.attrs, normalizedRows);
}

/**
 * Transform a slice by normalizing all tables within it.
 */
export function normalizeTablesInSlice(slice: Slice, schema: Schema): Slice {

  function transformFragment(fragment: Fragment): Fragment {
    const nodes: Node[] = [];
    fragment.forEach((node) => {
      if (node.type.name === "table") {
        nodes.push(normalizeTableNode(node, schema));
      } else if (node.content.size > 0) {
        // Recursively transform children
        nodes.push(
          node.type.create(
            node.attrs,
            transformFragment(node.content),
            node.marks,
          ),
        );
      } else {
        nodes.push(node);
      }
    });
    return Fragment.from(nodes);
  }

  return new Slice(
    transformFragment(slice.content),
    slice.openStart,
    slice.openEnd,
  );
}
