import { Typography } from "@mui/material";
import { maskWithSuffix } from "../lib/pii";

type Props = {
  name: string;
  value: string | null | undefined;
  redactedFields: string[];
  suffix?: string;
};

export function PiiField({ name, value, redactedFields, suffix }: Props) {
  const redacted = redactedFields.includes(name);
  if (redacted) {
    return <Typography component="span">{maskWithSuffix(suffix ?? "", 4)}</Typography>;
  }
  return <Typography component="span">{value ?? ""}</Typography>;
}
