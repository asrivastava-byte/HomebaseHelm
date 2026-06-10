module Entities
  class CompanyBiller < Grape::Entity
    PII_FIELDS = %w[credit_cards].freeze

    expose(:company_id) { |obj| obj["company_id"] || obj[:company_id] }

    expose(:locations) do |obj|
      (obj["locations"] || obj[:locations] || []).map do |l|
        { id: l["id"] || l[:id], name: l["name"] || l[:name] }
      end
    end

    expose(:tier_history) do |obj|
      (obj["tier_history"] || obj[:tier_history] || []).map do |t|
        {
          tier:       t["tier"]       || t[:tier],
          started_at: t["started_at"] || t[:started_at],
          ended_at:   t["ended_at"]   || t[:ended_at]
        }
      end
    end

    with_options(if: ->(_obj, opts) { opts[:role]&.can?("account.view_pii") }) do
      expose(:credit_cards) do |obj|
        (obj["credit_cards"] || obj[:credit_cards] || []).map do |c|
          {
            brand:     c["brand"]     || c[:brand],
            last4:     c["last4"]     || c[:last4],
            exp_month: c["exp_month"] || c[:exp_month],
            exp_year:  c["exp_year"]  || c[:exp_year],
            primary:   c["primary"].nil? ? c[:primary] : c["primary"]
          }
        end
      end
    end

    expose :_redacted do |_obj, opts|
      opts[:role]&.can?("account.view_pii") ? [] : PII_FIELDS
    end
  end
end
