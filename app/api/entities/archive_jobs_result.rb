module Entities
  class ArchiveJobsResult < Grape::Entity
    expose(:archived_job_count) { |obj| obj["archived_job_count"] || obj[:archived_job_count] }
    expose(:archived_at)        { |obj| obj["archived_at"]        || obj[:archived_at] }
  end
end
