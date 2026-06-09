require "rails_helper"
require_relative "../../../scripts/lib/scaffold/naming"

RSpec.describe Scaffold::Naming do
  it "derives names for company_merchant/company" do
    n = described_class.new(workflow: "company_merchant", resource: "company")
    expect(n.workflow_snake).to        eq("company_merchant")
    expect(n.workflow_camel).to        eq("CompanyMerchant")
    expect(n.resource_singular).to     eq("company")
    expect(n.resource_plural).to       eq("companies")
    expect(n.resource_class).to        eq("Company")
    expect(n.resource_plural_camel).to eq("Companies")
    expect(n.page_dir).to              eq("CompanyMerchant")
    expect(n.api_class).to             eq("CompaniesApi")
    expect(n.audit_workflow).to        eq("company_merchant")
    expect(n.permission_view_key).to   eq("account.view_company")
    expect(n.permission_module).to     eq("account")
  end

  it "derives names for location_management/location" do
    n = described_class.new(workflow: "location_management", resource: "location")
    expect(n.resource_plural).to       eq("locations")
    expect(n.resource_plural_camel).to eq("Locations")
    expect(n.page_dir).to              eq("LocationManagement")
    expect(n.api_class).to             eq("LocationsApi")
    expect(n.permission_view_key).to   eq("account.view_location")
  end

  it "raises on bad workflow names" do
    expect { described_class.new(workflow: "BadName", resource: "foo") }
      .to raise_error(ArgumentError, /snake_case/)
  end

  it "raises on bad resource names" do
    expect { described_class.new(workflow: "x_y", resource: "Cap") }
      .to raise_error(ArgumentError, /snake_case/)
  end
end
