module Entities
  class VerificationResult < Grape::Entity
    expose(:sent_at)             { |obj| obj.is_a?(Hash) ? (obj["sent_at"] || obj[:sent_at]) : obj.sent_at }
    expose(:provider_request_id) { |obj| obj.is_a?(Hash) ? (obj["provider_request_id"] || obj[:provider_request_id]) : obj.provider_request_id }
  end
end
