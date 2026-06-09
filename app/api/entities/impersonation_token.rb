module Entities
  class ImpersonationToken < Grape::Entity
    expose(:url)        { |obj| obj.is_a?(Hash) ? (obj["url"] || obj[:url]) : obj.url }
    expose(:expires_at) { |obj| obj.is_a?(Hash) ? (obj["expires_at"] || obj[:expires_at]) : obj.expires_at }
  end
end
