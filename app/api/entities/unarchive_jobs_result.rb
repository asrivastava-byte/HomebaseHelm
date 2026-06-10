module Entities
  class UnarchiveJobsResult < Grape::Entity
    expose(:unarchived_job_count) { |obj| obj["unarchived_job_count"] || obj[:unarchived_job_count] }
    expose(:unarchived_at)        { |obj| obj["unarchived_at"]        || obj[:unarchived_at] }
  end
end
