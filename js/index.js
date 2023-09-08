$(function(){
    const init_ctn = function () {
        console.log("欢迎访问我得小站...");
    };

    init_ctn();

    $("#a_home").click(function(){
        alert("欢迎光临，请上座")
    });

    $("#a_github").click(function(){
        alert("马上跳转到我的小站 Github，欢迎吐槽 ！")
        window.open("https://github.com/yuanq20");
    });


});