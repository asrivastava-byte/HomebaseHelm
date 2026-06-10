module Entities
  class Location < Grape::Entity
    PII_FIELDS = %w[].freeze

    expose(:id)                 { |obj| obj["id"]                 || obj[:id] }
    expose(:name)               { |obj| obj["name"]               || obj[:name] }
    expose(:company_id)         { |obj| obj["company_id"]         || obj[:company_id] }
    expose(:address)            { |obj| obj["address"]            || obj[:address] }
    expose(:tier)               { |obj| obj["tier"]               || obj[:tier] }
    expose(:partner_name)       { |obj| obj["partner_name"]       || obj[:partner_name] }
    expose(:job_count)          { |obj| obj["job_count"]          || obj[:job_count] || 0 }
    expose(:archived_job_count) { |obj| obj["archived_job_count"] || obj[:archived_job_count] || 0 }
    expose(:created_at)         { |obj| obj["created_at"]         || obj[:created_at] }

    expose(:users) do |obj|
      (obj["users"] || obj[:users] || []).map do |u|
        {
          id:               u["id"]               || u[:id],
          name:             u["name"]             || u[:name],
          email:            u["email"]            || u[:email],
          role_at_location: u["role_at_location"] || u[:role_at_location]
        }
      end
    end

    expose :_redacted do |_obj, opts|
      opts[:role]&.can?("account.view_pii") ? [] : PII_FIELDS
    end
  end
end
