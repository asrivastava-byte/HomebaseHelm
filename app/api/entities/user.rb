module Entities
  class User < Grape::Entity
    PII_FIELDS = %w[phone ssn_last4 bank_last4].freeze

    expose(:id)              { |obj| obj["id"]              || obj[:id] }
    expose(:email)           { |obj| obj["email"]           || obj[:email] }
    expose(:full_name)       { |obj| obj["full_name"]       || obj[:full_name] }
    expose(:created_at)      { |obj| obj["created_at"]      || obj[:created_at] }
    expose(:last_sign_in_at) { |obj| obj["last_sign_in_at"] || obj[:last_sign_in_at] }
    expose(:stytch_subject)  { |obj| obj["stytch_subject"]  || obj[:stytch_subject] }

    with_options(if: ->(_obj, opts) { opts[:role]&.can?("account.view_pii") }) do
      expose(:phone)      { |obj| obj["phone"]      || obj[:phone] }
      expose(:ssn_last4)  { |obj| obj["ssn_last4"]  || obj[:ssn_last4] }
      expose(:bank_last4) { |obj| obj["bank_last4"] || obj[:bank_last4] }
    end

    expose :_redacted do |_obj, opts|
      opts[:role]&.can?("account.view_pii") ? [] : PII_FIELDS
    end
  end
end
