import { Button } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { locationsApi, ArchiveJobsResult } from "../../lib/locations";

type Props = {
  locationId: number;
  onSuccess: (result: ArchiveJobsResult) => void;
};

export function ArchiveJobsButton({ locationId, onSuccess }: Props) {
  const mutation = useMutation({
    mutationFn: () => locationsApi.archiveJobs(locationId),
    onSuccess,
  });

  const handleClick = () => {
    if (!window.confirm(`Archive all jobs for location #${locationId}? This cannot be undone.`)) return;
    mutation.mutate();
  };

  return (
    <Button variant="contained" color="warning" disabled={mutation.isPending} onClick={handleClick}>
      Archive jobs
    </Button>
  );
}
