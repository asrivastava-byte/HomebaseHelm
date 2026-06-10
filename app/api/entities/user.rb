module Entities
  class User < Grape::Entity
    PII_FIELDS = %w[phone ssn_last4 bank_last4].freeze

    expose(:id)              { |obj| obj["id"]              || obj[:id] }
    expose(:email)           { |obj| obj["email"]           || obj[:email] }
    expose(:full_name)       { |obj| obj["full_name"]       || obj[:full_name] }
    expose(:created_at)      { |obj| obj["created_at"]      || obj[:created_at] }
    expose(:last_sign_in_at) { |obj| obj["last_sign_in_at"] || obj[:last_sign_in_at] }
    expose(:stytch_subject)  { |obj| obj["stytch_subject"]  || obj[:stytch_subject] }
    expose(:mfa_status)      { |obj| obj["mfa_status"]      || obj[:mfa_status] }
    expose(:bank_account_present) do |obj|
      val = obj["bank_account_present"]
      val = obj[:bank_account_present] if val.nil?
      val.nil? ? false : val
    end

    expose(:memberships) do |obj|
      (obj["memberships"] || obj[:memberships] || []).map do |m|
        {
          company_id:       m["company_id"]       || m[:company_id],
          company_name:     m["company_name"]     || m[:company_name],
          location_id:      m["location_id"]      || m[:location_id],
          location_name:    m["location_name"]    || m[:location_name],
          role_at_location: m["role_at_location"] || m[:role_at_location],
          since:            m["since"]            || m[:since]
        }
      end
    end

    expose(:jobs) do |obj|
      (obj["jobs"] || obj[:jobs] || []).map do |j|
        {
          id:            j["id"]            || j[:id],
          title:         j["title"]         || j[:title],
          status:        j["status"]        || j[:status],
          location_id:   j["location_id"]   || j[:location_id],
          location_name: j["location_name"] || j[:location_name],
          scheduled_for: j["scheduled_for"] || j[:scheduled_for]
        }
      end
    end

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
