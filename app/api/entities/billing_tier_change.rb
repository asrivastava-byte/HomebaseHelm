module Entities
  class BillingTierChange < Grape::Entity
    expose(:from_tier)    { |obj| obj["from_tier"]    || obj[:from_tier] }
    expose(:to_tier)      { |obj| obj["to_tier"]      || obj[:to_tier] }
    expose(:effective_at) { |obj| obj["effective_at"] || obj[:effective_at] }
  end
end
