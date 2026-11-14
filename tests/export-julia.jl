using Test
push!(ARGS,"--no-plot")
root=abspath(ARGS[1])
for (name,expected) in [("square",.5),("difference",1.0),("twelve",.5)]
    fixture=Module(Symbol("Fixture_"*name));Base.include(fixture,joinpath(root,name*".jl"))
    payload=getfield(fixture,:PAYLOAD);term=payload["visualizations"][1]["root"]
    descriptor=Base.invokelatest(getfield(fixture,:numeric_descriptor),term)
    @test Base.invokelatest(descriptor.cdf,name=="twelve" ? 0.0 : .25)≈expected atol=1e-10
    @test length(getfield(fixture,:EQUATIONS))>0
    law=Base.invokelatest(getfield(fixture,:symbolic_cdf),term)
    @test length(law.source_ids)==(name=="square" ? 1 : name=="twelve" ? 12 : 0)
end
println("Julia exports passed symbolic equation DAG, shared-source identity, and analytic CDF evaluation.")
