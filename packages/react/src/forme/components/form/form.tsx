import {
  usePdfcnTheme,
  useSafeMemo,
} from "../theme-provider";
import {
  Text as PDFText,
  View,
} from "../../lib/pdf-primitives";
import type { Style } from "../../lib/pdf-primitives";

import { createFormStyles } from "./form.styles";
import type {
  FormLayout,
  PdfFormField,
  PdfFormGroup,
  PdfFormProps,
} from "./form.types";

const renderFieldAbove = (
  field: PdfFormField,
  idx: number,
  styles: ReturnType<typeof createFormStyles>
) => {
  const areaHeight = field.height ?? 18;
  const areaStyle: Style[] = [styles.fieldArea, { minHeight: areaHeight }];

  return (
    <View key={`${field.label}-${idx}`} style={styles.fieldAbove}>
      <PDFText style={styles.labelAbove}>{field.label}</PDFText>
      <View style={areaStyle as never}>
        {field.hint ? (
          <PDFText style={styles.hint}>{field.hint}</PDFText>
        ) : null}
      </View>
    </View>
  );
};

const renderFieldLeft = (
  field: PdfFormField,
  idx: number,
  styles: ReturnType<typeof createFormStyles>
) => {
  const areaHeight = field.height ?? 18;
  const areaStyle: Style[] = [
    styles.fieldArea,
    styles.fieldLeftArea,
    { minHeight: areaHeight },
  ];

  return (
    <View key={`${field.label}-${idx}`} style={styles.fieldLeft}>
      <PDFText style={styles.labelLeft}>{field.label}</PDFText>
      <View style={areaStyle as never}>
        {field.hint ? (
          <PDFText style={styles.hint}>{field.hint}</PDFText>
        ) : null}
      </View>
    </View>
  );
};

const renderGroup = (
  group: PdfFormGroup,
  gi: number,
  styles: ReturnType<typeof createFormStyles>,
  labelPosition: "above" | "left"
) => {
  const layout: FormLayout = group.layout ?? "single";
  let cols: number;
  if (layout === "three-column") {
    cols = 3;
  } else if (layout === "two-column") {
    cols = 2;
  } else {
    cols = 1;
  }

  const renderField = (field: PdfFormField, idx: number) =>
    labelPosition === "left"
      ? renderFieldLeft(field, idx, styles)
      : renderFieldAbove(field, idx, styles);

  if (cols === 1) {
    return (
      <View key={`group-${gi}`} style={styles.group}>
        {group.title ? (
          <PDFText style={styles.groupTitle}>{group.title}</PDFText>
        ) : null}
        {group.fields.map(renderField)}
      </View>
    );
  }

  const chunkSize = Math.ceil(group.fields.length / cols);
  const chunks: PdfFormField[][] = [];
  for (let i = 0; i < group.fields.length; i += chunkSize) {
    chunks.push(group.fields.slice(i, i + chunkSize));
  }
  while (chunks.length < cols) {
    chunks.push([]);
  }

  return (
    <View key={`group-${gi}`} style={styles.group}>
      {group.title ? (
        <PDFText style={styles.groupTitle}>{group.title}</PDFText>
      ) : null}
      <View style={styles.columnsRow}>
        {chunks.map((chunk, ci) => (
          <View
            key={`col-${gi}-${chunk[0]?.label ?? ci}`}
            style={styles.column}
          >
            {chunk.map(renderField)}
          </View>
        ))}
      </View>
    </View>
  );
};

export const PdfForm = ({
  title,
  subtitle,
  groups,
  variant = "underline",
  labelPosition = "above",
  noWrap = false,
  style,
}: PdfFormProps) => {
  const theme = usePdfcnTheme();
  const styles = useSafeMemo(
    () => createFormStyles(theme, variant),
    [theme, variant]
  );

  const rootStyles: Style[] = [styles.root];
  if (style) {
    rootStyles.push(style);
  }

  const inner = (
    <View style={rootStyles as never}>
      {title ? <PDFText style={styles.formTitle}>{title}</PDFText> : null}
      {subtitle ? (
        <PDFText style={styles.formSubtitle}>{subtitle}</PDFText>
      ) : null}
      {title || subtitle ? <View style={styles.formDivider} /> : null}
      {groups.map((group, gi) => renderGroup(group, gi, styles, labelPosition))}
    </View>
  );

  return noWrap ? <View wrap={false}>{inner}</View> : inner;
};
