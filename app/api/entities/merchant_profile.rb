module Entities
  class MerchantProfile < Grape::Entity
    PII_FIELDS = %w[payment_method].freeze

    expose(:tier)                     { |obj| obj["tier"]                    || obj[:tier] }
    expose(:billing_state)            { |obj| obj["billing_state"]           || obj[:billing_state] }
    expose(:subscription_started_at)  { |obj| obj["subscription_started_at"] || obj[:subscription_started_at] }
    expose(:subscription_renews_at)   { |obj| obj["subscription_renews_at"]  || obj[:subscription_renews_at] }
    expose(:check_entity_id)          { |obj| obj["check_entity_id"]         || obj[:check_entity_id] }
    expose(:recent_invoices) do |obj|
      (obj["recent_invoices"] || obj[:recent_invoices] || []).map do |inv|
        {
          id:           inv["id"]           || inv[:id],
          amount_cents: inv["amount_cents"] || inv[:amount_cents],
          status:       inv["status"]       || inv[:status],
          paid_at:      inv["paid_at"]      || inv[:paid_at]
        }
      end
    end

    with_options(if: ->(_obj, opts) { opts[:role]&.can?("account.view_pii") }) do
      expose(:payment_method) do |obj|
        raw = obj["payment_method"] || obj[:payment_method]
        next nil if raw.nil?
        { last4: raw["last4"] || raw[:last4], brand: raw["brand"] || raw[:brand] }
      end
    end

    expose :_redacted do |_obj, opts|
      opts[:role]&.can?("account.view_pii") ? [] : PII_FIELDS
    end
  end
end
