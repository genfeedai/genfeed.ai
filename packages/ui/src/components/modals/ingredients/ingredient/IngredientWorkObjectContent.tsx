import { keyListItems } from '@genfeedai/helpers/ui/list/key-list-items';
import type { IngredientWorkObjectContentProps } from '@genfeedai/props/ui/ingredients/ingredient-work-object-content.props';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/primitives/table';

export default function IngredientWorkObjectContent({
  material,
}: IngredientWorkObjectContentProps) {
  return (
    <div className="col-span-full min-w-0 space-y-4 text-foreground">
      <h2 className="text-lg font-semibold">{material.title}</h2>
      {material.kind === 'table' ? (
        <div className="max-w-full overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {material.columns?.map((column) => (
                  <TableHead key={column.key}>{column.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {keyListItems(material.rows ?? [], (row) =>
                JSON.stringify(row),
              ).map(({ item: row, key }) => (
                <TableRow key={key}>
                  {material.columns?.map((column) => (
                    <TableCell key={column.key} className="whitespace-pre-wrap">
                      {row[column.key] ?? ''}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm leading-6">
          {material.body}
        </p>
      )}
    </div>
  );
}
