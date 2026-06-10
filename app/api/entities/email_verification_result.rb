module Entities
  class EmailVerificationResult < Grape::Entity
    expose(:sent_at)             { |obj| obj["sent_at"]             || obj[:sent_at] }
    expose(:provider_request_id) { |obj| obj["provider_request_id"] || obj[:provider_request_id] }
    expose(:to_email)            { |obj| obj["to_email"]            || obj[:to_email] }
  end
end
