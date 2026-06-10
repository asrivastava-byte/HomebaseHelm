module Entities
  class Company < Grape::Entity
    PII_FIELDS = %w[stripe_customer_id].freeze

    expose(:id)            { |obj| obj["id"]            || obj[:id] }
    expose(:name)          { |obj| obj["name"]          || obj[:name] }
    expose(:tier)          { |obj| obj["tier"]          || obj[:tier] }
    expose(:owner_user_id) { |obj| obj["owner_user_id"] || obj[:owner_user_id] }
    expose(:created_at)    { |obj| obj["created_at"]    || obj[:created_at] }

    expose(:subscription) do |obj|
      raw = obj["subscription"] || obj[:subscription]
      next nil if raw.nil?
      {
        status:     raw["status"]     || raw[:status],
        started_at: raw["started_at"] || raw[:started_at],
        renews_at:  raw["renews_at"]  || raw[:renews_at]
      }
    end

    expose(:locations) do |obj|
      (obj["locations"] || obj[:locations] || []).map do |l|
        { id: l["id"] || l[:id], name: l["name"] || l[:name] }
      end
    end

    expose(:payment_attempts) do |obj|
      (obj["payment_attempts"] || obj[:payment_attempts] || []).map do |p|
        {
          id:             p["id"]             || p[:id],
          amount_cents:   p["amount_cents"]   || p[:amount_cents],
          status:         p["status"]         || p[:status],
          attempted_at:   p["attempted_at"]   || p[:attempted_at],
          failure_reason: p["failure_reason"] || p[:failure_reason]
        }
      end
    end

    with_options(if: ->(_obj, opts) { opts[:role]&.can?("account.view_pii") }) do
      expose(:stripe_customer_id) { |obj| obj["stripe_customer_id"] || obj[:stripe_customer_id] }
    end

    expose :_redacted do |_obj, opts|
      opts[:role]&.can?("account.view_pii") ? [] : PII_FIELDS
    end
  end
end
