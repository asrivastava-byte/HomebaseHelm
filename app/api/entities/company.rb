module Entities
  class Company < Grape::Entity
    PII_FIELDS = %w[stripe_customer_id].freeze

    expose(:id)            { |obj| obj["id"]            || obj[:id] }
    expose(:name)          { |obj| obj["name"]          || obj[:name] }
    expose(:tier)          { |obj| obj["tier"]          || obj[:tier] }
    expose(:owner_user_id) { |obj| obj["owner_user_id"] || obj[:owner_user_id] }
    expose(:created_at)    { |obj| obj["created_at"]    || obj[:created_at] }

    with_options(if: ->(_obj, opts) { opts[:role]&.can?("account.view_pii") }) do
      expose(:stripe_customer_id) { |obj| obj["stripe_customer_id"] || obj[:stripe_customer_id] }
    end

    expose :_redacted do |_obj, opts|
      opts[:role]&.can?("account.view_pii") ? [] : PII_FIELDS
    end
  end
end
