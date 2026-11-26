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

hydrogen = Module(:HydrogenFixture)
Base.include(hydrogen, joinpath(root, "hydrogen.jl"))
outputs = getfield(hydrogen, :PAYLOAD)["graph"]["outputs"]
descriptor(id) = Base.invokelatest(getfield(hydrogen, :numeric_descriptor), outputs[id]["root"])
@test Base.invokelatest(descriptor("radialTap").cdf, 1.0) ≈ 1 - 5exp(-2)
@test Base.invokelatest(descriptor("insideTap").cdf, 0.0) ≈ 5exp(-2)

furnace=Module(:FurnaceFixture)
Base.include(furnace,joinpath(root,"furnace.jl"))
payload=getfield(furnace,:PAYLOAD)
delta=Base.invokelatest(getfield(furnace,:numeric_descriptor),payload["graph"]["outputs"]["tapDiff"]["root"])
@test Base.invokelatest(delta.cdf,sqrt(.0018)) ≈ .8413447460685429

receiver = Module(:RFReceiverFixture)
Base.include(receiver, joinpath(root, "rf_receiver.jl"))
rf_outputs = getfield(receiver, :PAYLOAD)["graph"]["outputs"]
for (tap, mean, variance) in [("inputLaw", 4, 1), ("lnaLaw", 16, 20), ("outputLaw", 32, 96)]
    law = Base.invokelatest(getfield(receiver, :numeric_descriptor), rf_outputs[tap]["root"])
    @test Base.invokelatest(law.cdf, mean + sqrt(variance)) ≈ .8413447460685429
end
