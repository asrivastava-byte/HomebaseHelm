module Entities
  class CompanySalesTax < Grape::Entity
    expose(:company_id)                    { |obj| obj["company_id"]                    || obj[:company_id] }
    expose(:aggregate_tax_collected_cents) { |obj| obj["aggregate_tax_collected_cents"] || obj[:aggregate_tax_collected_cents] }

    expose(:per_location) do |obj|
      (obj["per_location"] || obj[:per_location] || []).map do |r|
        {
          location_id:   r["location_id"]   || r[:location_id],
          location_name: r["location_name"] || r[:location_name],
          tax_authority: r["tax_authority"] || r[:tax_authority],
          tax_id:        r["tax_id"]        || r[:tax_id],
          exempt:        (r["exempt"].nil?  ? r[:exempt] : r["exempt"]),
          last_filed_at: r["last_filed_at"] || r[:last_filed_at]
        }
      end
    end

    expose(:exemptions) do |obj|
      (obj["exemptions"] || obj[:exemptions] || []).map do |e|
        {
          kind:       e["kind"]       || e[:kind],
          granted_at: e["granted_at"] || e[:granted_at],
          expires_at: e["expires_at"] || e[:expires_at]
        }
      end
    end
  end
end
